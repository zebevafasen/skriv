import { sceneLabelPackSchema } from "@asterism/contracts";
import authoredLabelPacks from "./label-packs.json" with { type: "json" };

export const builtinLabelPacks = authoredLabelPacks.map((pack) => sceneLabelPackSchema.parse(pack));
