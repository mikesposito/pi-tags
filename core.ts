/**
 * Pure logic for pi-tags, kept free of pi imports so smoke.mjs can test it
 * with plain node.
 */

/** A session message entry, narrowed to the fields pi-tags needs. */
export type MessageEntry = {
	type: "message";
	id: string;
	message: { role: string; content: unknown };
};

/** Anything with a message role; entries without one are not messages. */
export function isMessageEntry(entry: unknown): entry is MessageEntry {
	return (
		typeof entry === "object" &&
		entry !== null &&
		(entry as { type?: unknown }).type === "message" &&
		typeof (entry as { id?: unknown }).id === "string" &&
		typeof (entry as { message?: unknown }).message === "object" &&
		(entry as { message?: { role?: unknown } }).message !== null &&
		typeof (entry as { message: { role?: unknown } }).message.role === "string"
	);
}

/** Flatten message content (string or content blocks) to plain text. */
export function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((b) => typeof b === "object" && b !== null && (b as { type?: string }).type === "text")
			.map((b) => (b as { text?: string }).text ?? "")
			.join(" ");
	}
	return "";
}

/** Collapse whitespace and cut to a preview width, for one-line listings. */
export function preview(text: string, width: number): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	return collapsed.length <= width ? collapsed : `${collapsed.slice(0, width)}…`;
}

/** The newest message entry on a branch (oldest-first entry list). */
export function lastMessageEntry(branch: readonly unknown[]): MessageEntry | undefined {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (isMessageEntry(entry)) return entry;
	}
	return undefined;
}

export type GetLabel = (id: string) => string | undefined;

/** Message entries on the branch that carry a label, oldest first. */
export function taggedMessages(branch: readonly unknown[], getLabel: GetLabel): MessageEntry[] {
	return branch.filter((e) => isMessageEntry(e) && Boolean(getLabel(e.id))) as MessageEntry[];
}

/**
 * Default label for the next tag: `tag-` plus the number of already-tagged
 * messages plus one, so quick tags are unique within the branch.
 */
export function nextDefaultLabel(branch: readonly unknown[], getLabel: GetLabel): string {
	return `tag-${taggedMessages(branch, getLabel).length + 1}`;
}

/**
 * Rows for /tagfork: one per forkable user message, numbered, with the
 * tag in brackets when set. A tag counts for a row when it sits on the
 * user message itself or on the message that follows it (normally the
 * assistant reply), because /tag labels the newest message, which is
 * usually the reply.
 */
export function forkRows(
	branch: readonly unknown[],
	getLabel: GetLabel,
): Array<{ id: string; option: string }> {
	const msgs = branch.filter(isMessageEntry) as MessageEntry[];
	const rows: Array<{ id: string; option: string }> = [];
	for (let i = 0; i < msgs.length; i++) {
		const entry = msgs[i];
		if (entry.message.role !== "user") continue;
		const text = messageText(entry.message.content).trim();
		if (!text) continue;
		const next = msgs[i + 1];
		const tag = getLabel(entry.id) ?? (next ? getLabel(next.id) : undefined);
		const prefix = `${String(rows.length + 1).padStart(2, " ")}. `;
		const body = tag ? `[${tag}] ${preview(text, 70)}` : preview(text, 70);
		rows.push({ id: entry.id, option: prefix + body });
	}
	return rows;
}

/** Selector row for /tags: tag, then a preview of the tagged message. */
export function tagListLines(branch: readonly unknown[], getLabel: GetLabel): string[] {
	return taggedMessages(branch, getLabel).map((entry) => {
		const tag = getLabel(entry.id) ?? "";
		return `# ${tag} - ${preview(messageText(entry.message.content), 60)}`;
	});
}

/**
 * The newest message on the branch carrying exactly this tag. Duplicate
 * tag names resolve to the most recent one.
 */
export function findTaggedEntry(
	branch: readonly unknown[],
	getLabel: GetLabel,
	tag: string,
): MessageEntry | undefined {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (isMessageEntry(entry) && getLabel(entry.id) === tag) return entry;
	}
	return undefined;
}
