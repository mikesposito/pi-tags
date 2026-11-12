import assert from "node:assert/strict";
import {
	findTaggedEntry,
	forkRows,
	isMessageEntry,
	lastMessageEntry,
	messageText,
	nextDefaultLabel,
	preview,
	tagListLines,
	taggedMessages,
} from "./core.ts";

// message entry guard
assert.ok(isMessageEntry({ type: "message", id: "u1", message: { role: "user", content: "hi" } }));
assert.ok(!isMessageEntry({ type: "compaction", id: "c1" }));
assert.ok(!isMessageEntry({ type: "message", id: "u1" })); // no message field
assert.ok(!isMessageEntry({ type: "message", id: 7, message: { role: "user" } })); // non-string id
assert.ok(!isMessageEntry(null));
assert.ok(!isMessageEntry(undefined));

// message text flattening
assert.equal(messageText("hello world"), "hello world");
assert.equal(
	messageText([{ type: "text", text: "a" }, { type: "image", data: "x" }, { type: "text", text: "b" }]),
	"a b",
);
assert.equal(messageText([]), "");
assert.equal(messageText(null), "");
assert.equal(messageText(42), "");

// preview collapses whitespace and truncates
assert.equal(preview("  a\n\nb   c  ", 20), "a b c");
assert.equal(preview("abcdefghij", 5), "abcde…");
assert.equal(preview("abc", 5), "abc");

// a branch: user, assistant, user (oldest first, like getBranch())
const branch = [
	{ type: "message", id: "u1", parentId: null, message: { role: "user", content: "first prompt" } },
	{
		type: "message",
		id: "a1",
		parentId: "u1",
		message: { role: "assistant", content: [{ type: "text", text: "hi there" }] },
	},
	{ type: "message", id: "u2", parentId: "a1", message: { role: "user", content: "second prompt" } },
	{
		type: "message",
		id: "a2",
		parentId: "u2",
		message: { role: "assistant", content: [{ type: "text", text: "second reply" }] },
	},
	{ type: "compaction", id: "c1", parentId: "a2" },
];

// last message on the branch
assert.equal(lastMessageEntry(branch)?.id, "a2");
assert.equal(lastMessageEntry([]), undefined);
assert.equal(lastMessageEntry([{ type: "compaction", id: "c1" }]), undefined);

// labels live in a map, like sessionManager.getLabel
const labels = {};
const getLabel = (id) => labels[id];

// tagged messages and default labels
assert.deepEqual(taggedMessages(branch, getLabel), []);
assert.equal(nextDefaultLabel(branch, getLabel), "tag-1");
labels["u1"] = "start";
labels["a1"] = "checkpoint";
assert.deepEqual(taggedMessages(branch, getLabel).map((e) => e.id), ["u1", "a1"]);
assert.equal(nextDefaultLabel(branch, getLabel), "tag-3");
// re-tagging the same entry does not inflate the count
labels["u2"] = "tag-3";
assert.equal(nextDefaultLabel(branch, getLabel), "tag-4");
delete labels["a1"];
assert.equal(nextDefaultLabel(branch, getLabel), "tag-3");

// fork picker rows: one per user message with text, numbered, ids kept for forking
let rows = forkRows(branch, getLabel);
assert.deepEqual(
	rows.map((r) => r.id),
	["u1", "u2"],
);
assert.deepEqual(forkRows([], getLabel), []);
assert.deepEqual(
	forkRows(
		[
			{ type: "message", id: "i1", message: { role: "user", content: [{ type: "image", data: "x" }] } },
			{ type: "message", id: "a9", message: { role: "assistant", content: "reply" } },
		],
		getLabel,
	),
	[],
);

// a tag on the user message shows on its row
assert.deepEqual(
	rows.map((r) => r.option),
	[" 1. [start] first prompt", " 2. [tag-3] second prompt"],
);
// a tag on the assistant reply shows on the row of the user message it answers
delete labels["u2"];
labels["a2"] = "reply-tag";
rows = forkRows(branch, getLabel);
assert.deepEqual(
	rows.map((r) => r.option),
	[" 1. [start] first prompt", " 2. [reply-tag] second prompt"],
);
// a user message with no tag anywhere gets no bracket
delete labels["a2"];
assert.deepEqual(
	forkRows(branch, getLabel).map((r) => r.option),
	[" 1. [start] first prompt", " 2. second prompt"],
);

// long messages preview, keeping the row short
const long = [
	{ type: "message", id: "x", parentId: null, message: { role: "user", content: "word ".repeat(40) } },
];
assert.ok(forkRows(long, getLabel)[0].option.length < 90);
assert.ok(forkRows(long, getLabel)[0].option.endsWith("…"));

// /tags listing
labels["a1"] = "checkpoint";
labels["u2"] = "tag-3";
assert.deepEqual(tagListLines(branch, getLabel), [
	"# start - first prompt",
	"# checkpoint - hi there",
	"# tag-3 - second prompt",
]);
delete labels["u2"];
assert.deepEqual(tagListLines(branch, getLabel), ["# start - first prompt", "# checkpoint - hi there"]);
assert.deepEqual(tagListLines(branch, getLabel).length, 2);
assert.deepEqual(tagListLines([], getLabel), []);

// /checkout tag lookup: newest match wins, others miss cleanly
assert.equal(findTaggedEntry(branch, getLabel, "start")?.id, "u1");
assert.equal(findTaggedEntry(branch, getLabel, "checkpoint")?.id, "a1");
assert.equal(findTaggedEntry(branch, getLabel, "nope"), undefined);
assert.equal(findTaggedEntry([], getLabel, "start"), undefined);
// duplicate tag names resolve to the most recent
labels["u2"] = "start";
assert.equal(findTaggedEntry(branch, getLabel, "start")?.id, "u2");
delete labels["u2"];
// non-message entries carrying the label id are never returned
assert.equal(
	findTaggedEntry([{ type: "label", id: "l1", targetId: "u1", label: "start" }], getLabel, "start"),
	undefined,
);

console.log("pi-tags core: all checks passed");
