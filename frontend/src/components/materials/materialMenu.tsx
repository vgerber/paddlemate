import RowMenu, { type RowAction } from "@/components/RowMenu";
import type { Material } from "@/lib/api";
import {
  AddPhotoIcon,
  CompareIcon,
  DeleteIcon,
  EditIcon,
  PhotoIcon,
} from "@/lib/icons";

/** Names each photo by its credit; two photos with one credit get a number
 * so every menu entry stays distinct. */
function photoLabels(images: Material["images"]): string[] {
  const counts = new Map<string, number>();
  for (const image of images) {
    counts.set(image.credit, (counts.get(image.credit) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return images.map((image) => {
    const n = (seen.get(image.credit) ?? 0) + 1;
    seen.set(image.credit, n);
    const suffix = (counts.get(image.credit) ?? 0) > 1 ? ` (${n})` : "";
    return `Remove photo: ${image.credit}${suffix}`;
  });
}

/** The one menu of an entry's page, in a fixed order: suggest a change, add
 * a photo, compare sizes, then (after a rule) the removals. Suggesting and
 * adding a photo are open to everyone, the sign-in gate catches a visitor;
 * taking photos down is the admin's; deleting is for the signed in. */
export function materialMenu({
  material,
  canDelete,
  canCompare,
  onSuggest,
  onAddPhoto,
  onCompare,
  onDelete,
  onRemovePhoto,
  onRemoveBrandPhotos,
}: {
  material: Material;
  canDelete: boolean;
  /** The model has more than one size. */
  canCompare: boolean;
  onSuggest: () => void;
  onAddPhoto: () => void;
  onCompare: () => void;
  onDelete: () => void;
  /** Admin only: takedown of one of the entry's photos. */
  onRemovePhoto?: (imageId: number) => void;
  /** Admin only: takedown of every photo of the entry's brand. */
  onRemoveBrandPhotos?: () => void;
}) {
  const actions: RowAction[] = [
    { label: "Suggest a change", icon: <EditIcon />, onClick: onSuggest },
    { label: "Add photo", icon: <AddPhotoIcon />, onClick: onAddPhoto },
  ];
  if (canCompare) {
    actions.push({
      label: "Compare sizes",
      icon: <CompareIcon />,
      onClick: onCompare,
    });
  }
  const photos = material.images;
  let ruled = false;
  const danger = (action: RowAction) => {
    actions.push({ ...action, danger: true, groupStart: !ruled });
    ruled = true;
  };
  if (onRemovePhoto) {
    const labels = photoLabels(photos);
    photos.forEach((image, index) => {
      danger({
        label: labels[index],
        icon: <PhotoIcon />,
        onClick: () => onRemovePhoto(image.id),
      });
    });
  }
  if (onRemoveBrandPhotos && photos.length > 0) {
    danger({
      label: `Remove all ${material.brand} photos`,
      icon: <PhotoIcon />,
      onClick: onRemoveBrandPhotos,
    });
  }
  if (canDelete) {
    danger({
      label: "Delete entry",
      icon: <DeleteIcon />,
      onClick: onDelete,
    });
  }
  return <RowMenu actions={actions} label="Entry actions" />;
}
