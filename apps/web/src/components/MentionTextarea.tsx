import type { CompendiumEntry } from "@asterism/contracts";
import { findMentions } from "@asterism/core";
import { forwardRef, type ReactNode, type TextareaHTMLAttributes, useRef } from "react";

type MentionTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  entries: CompendiumEntry[];
  onValueChange: (value: string) => void;
  wrapperClassName?: string;
};

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  function MentionTextarea(
    { value, entries, onValueChange, wrapperClassName = "", className = "", ...props },
    forwardedRef,
  ) {
    const highlightRef = useRef<HTMLDivElement>(null);
    const matches = findMentions(value, entries, { includeUntracked: true });
    const pieces: ReactNode[] = [];
    let cursor = 0;

    for (const match of matches) {
      if (match.from > cursor) pieces.push(value.slice(cursor, match.from));
      pieces.push(
        <mark key={`${match.from}-${match.to}`}>{value.slice(match.from, match.to)}</mark>,
      );
      cursor = match.to;
    }
    if (cursor < value.length) pieces.push(value.slice(cursor));

    return (
      <div className={`mention-textarea ${wrapperClassName}`.trim()}>
        <div
          ref={highlightRef}
          className={`mention-textarea-highlights ${className}`.trim()}
          aria-hidden="true"
        >
          {pieces}
          {value.endsWith("\n") ? " " : null}
        </div>
        <textarea
          {...props}
          ref={forwardedRef}
          className={className}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onScroll={(event) => {
            if (highlightRef.current) {
              highlightRef.current.scrollTop = event.currentTarget.scrollTop;
              highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }
            props.onScroll?.(event);
          }}
        />
      </div>
    );
  },
);
