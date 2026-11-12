/**
 * pi-tags: tag points in a pi conversation.
 *
 * Tags are pi entry labels: persisted in the session file as LabelEntry,
 * carried into forks, and shown natively in /tree (where Shift+L edits a
 * label and Ctrl+L filters to labeled entries only). The built-in /fork
 * picker shows only message text and cannot be modified by an extension,
 * so /tagfork provides the same picker with each message's tag inline.
 *
 * Commands:
 * - /tag [label]: tag the last message on the active branch. Without a
 *   label, one is generated (tag-N, N counting tagged messages).
 * - /untag: remove the tag from the last message.
 * - /tags: list every tag on the active branch.
 * - /tagfork: pick a user message to fork from, tags shown inline.
 * - /checkout <tag>: jump to a tagged entry, no branch summary.
 * - alt+t: quick-tag the last message with a generated label.
 *
 * To tag an older point, navigate there with /tree first: tagging always
 * applies to the newest message of the active branch.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	findTaggedEntry,
	forkRows,
	lastMessageEntry,
	nextDefaultLabel,
	tagListLines,
} from "./core.ts";

export default function (pi: ExtensionAPI) {
	const branchOf = (ctx: ExtensionContext) => ctx.sessionManager.getBranch() as readonly unknown[];
	const getLabel = (ctx: ExtensionContext) => (id: string) => ctx.sessionManager.getLabel(id);

	const applyTag = (ctx: ExtensionContext, label: string) => {
		const entry = lastMessageEntry(branchOf(ctx));
		if (!entry) {
			ctx.ui.notify("No message to tag yet", "warning");
			return;
		}
		pi.setLabel(entry.id, label);
		ctx.ui.notify(`Tagged: ${label}`, "info");
	};

	pi.registerCommand("tag", {
		description: "Tag the last message (usage: /tag [label])",
		handler: async (args, ctx) => {
			applyTag(ctx, args.trim() || nextDefaultLabel(branchOf(ctx), getLabel(ctx)));
		},
	});

	pi.registerCommand("untag", {
		description: "Remove the tag from the last message",
		handler: async (_args, ctx) => {
			const entry = lastMessageEntry(branchOf(ctx));
			const label = entry ? ctx.sessionManager.getLabel(entry.id) : undefined;
			if (!entry || !label) {
				ctx.ui.notify("Last message is not tagged", "warning");
				return;
			}
			pi.setLabel(entry.id, undefined);
			ctx.ui.notify(`Removed tag: ${label}`, "info");
		},
	});

	pi.registerCommand("tags", {
		description: "List tags on the active branch",
		handler: async (_args, ctx) => {
			const lines = tagListLines(branchOf(ctx), getLabel(ctx));
			ctx.ui.notify(lines.length ? lines.join("\n") : "No tags yet. Use /tag [label].", "info");
		},
	});

	pi.registerCommand("tagfork", {
		description: "Fork picker that shows tags (like /fork)",
		handler: async (_args, ctx) => {
			const rows = forkRows(branchOf(ctx), getLabel(ctx));
			if (rows.length === 0) {
				ctx.ui.notify("No messages to fork from", "warning");
				return;
			}
			const options = rows.map((r) => r.option);
			const choice = await ctx.ui.select("Fork from message (tags shown)", options);
			if (choice === undefined) return;
			const index = options.indexOf(choice);
			if (index >= 0) await ctx.fork(rows[index].id);
		},
	});

	// /checkout is not a pi built-in, so the name is free for extensions.
	pi.registerCommand("checkout", {
		description: "Jump to a tagged entry, no branch summary (usage: /checkout <tag>)",
		handler: async (args, ctx) => {
			const tag = args.trim();
			if (!tag) {
				ctx.ui.notify("Usage: /checkout <tag> (see /tags)", "warning");
				return;
			}
			const target = findTaggedEntry(branchOf(ctx), getLabel(ctx), tag);
			if (!target) {
				ctx.ui.notify(`No tag "${tag}" on the active branch`, "warning");
				return;
			}
			const result = await ctx.navigateTree(target.id, { summarize: false });
			if (!result.cancelled) ctx.ui.notify(`Checked out: ${tag}`, "info");
		},
	});

	pi.registerShortcut("alt+t", {
		description: "Tag the last message with a generated label",
		handler: async (ctx) => {
			applyTag(ctx, nextDefaultLabel(branchOf(ctx), getLabel(ctx)));
		},
	});
}
