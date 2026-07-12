import type { TagPack } from "@asterism/contracts";
import { Check } from "lucide-react";

export function TagPackPicker({
  packs,
  selectedIds,
  onToggle,
  disabled = false,
}: {
  packs: TagPack[];
  selectedIds: ReadonlySet<string>;
  onToggle: (pack: TagPack, selected: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="tag-pack-picker">
      <legend>Tag packs</legend>
      {packs.map((pack) => {
        const selected = selectedIds.has(pack.id);
        return (
          <button
            type="button"
            key={pack.id}
            className={`tag-pack-tile${selected ? " selected" : ""}`}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onToggle(pack, selected)}
          >
            <span className="tag-pack-check" aria-hidden="true">
              {selected ? <Check size={13} strokeWidth={3} /> : null}
            </span>
            <span className="tag-pack-copy">
              <strong>{pack.name}</strong>
              <small>{pack.description}</small>
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
