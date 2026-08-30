import AddLocationAltOutlinedIcon from "@mui/icons-material/AddLocationAltOutlined";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import CloseIcon from "@mui/icons-material/Close";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import SendIcon from "@mui/icons-material/Send";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ImageLightbox from "@/components/ImageLightbox";
import EmptyState from "@/components/states/EmptyState";
import LoadingBox from "@/components/states/LoadingBox";
import SignInGate from "@/components/states/SignInGate";
import type { CommentCategory, Media, SectionWithFeatures } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/client";
import { CATEGORY_ORDER, categoryLabel } from "@/lib/comments";
import {
  useCreateComment,
  useDeleteComment,
  useDeleteMedia,
  useSectionComments,
  useUploadMedia,
  useWaterwayComments,
} from "@/lib/hooks/useComments";
import { useSession } from "@/lib/hooks/useSession";
import { theme } from "@/lib/theme";
import CommentRow from "./CommentRow";

const { tokens } = theme;

/** The page's control scale - MUI's own runs bigger than everything here. */
const selectSx = {
  "& .MuiInputBase-input": { fontSize: { xs: "1rem", md: "0.8125rem" } },
  "& .MuiInputBase-inputSizeSmall": { py: { xs: "12px", md: "8.5px" } },
} as const;
const menuItemSx = {
  fontSize: { xs: "0.9rem", md: "0.8125rem" },
  minHeight: { xs: 44, md: 32 },
} as const;
/** The composer at thumb size on a phone, panel size on desktop. 16px on
 * mobile is deliberate: anything smaller makes iOS zoom the page on focus.
 * The adornment only drops to the bottom once the field grows - on one
 * line the icons belong in the middle of it. */
const composerSx = (open: boolean) =>
  ({
    "& .MuiInputBase-input": { fontSize: { xs: "1rem", md: "0.8125rem" } },
    "& .MuiInputBase-inputSizeSmall": { py: { xs: "12px", md: "8.5px" } },
    "& .MuiInputBase-root": { pr: 0.5 },
    // Only the icons follow the box as it grows; the text keeps its own
    // alignment, which is what centres it on a single line.
    "& .MuiInputAdornment-positionEnd": {
      alignSelf: open ? "flex-end" : "center",
      mb: open ? 0.5 : 0,
      height: "auto",
    },
  }) as const;

/** Touch targets: a phone needs the full 40px, a mouse does not. */
const composerIconSx = {
  p: { xs: 1, md: 0.5 },
  "& .MuiSvgIcon-root": { fontSize: { xs: 20, md: 17 } },
} as const;

/** Notes on a river: the thread, and a composer that can carry photos.
 * Photos are uploaded as they are picked and only claimed by the note when
 * it is posted, which is what lets the server refuse someone else's. */
export default function CommentThread({
  waterwayId,
  sections = [],
  /** Set when a section is open: the thread is that section's. Otherwise
   * this is the river overview, covering it and all its sections. */
  sectionId: sectionScope = null,
  mapPin,
}: {
  waterwayId: number;
  sections?: SectionWithFeatures[];
  sectionId?: number | null;
  /** Map-page only: place a pin for the note and focus existing ones. */
  mapPin?: {
    placing: boolean;
    pin: [number, number] | null;
    onTogglePlacing: () => void;
    onClearPin: () => void;
    onFocus: (lngLat: [number, number]) => void;
    selectedNoteId: number | null;
    onSelectNote: (id: number | null) => void;
  };
}) {
  const { isAuthenticated, user, isAdmin } = useSession();

  const riverThread = useWaterwayComments(
    sectionScope == null ? waterwayId : null,
    true,
  );
  const sectionThread = useSectionComments(
    sectionScope == null ? null : waterwayId,
    sectionScope,
  );
  const { data: comments, isLoading } =
    sectionScope == null ? riverThread : sectionThread;

  const createComment = useCreateComment(waterwayId, sectionScope);
  const deleteComment = useDeleteComment(waterwayId);
  const uploadMedia = useUploadMedia(waterwayId, sectionScope);
  const deleteMedia = useDeleteMedia(waterwayId);
  const sectionName = (id: number) =>
    sections.find((section) => section.id === id)?.name;

  const [body, setBody] = useState("");
  const [category, setCategory] = useState<CommentCategory>("info");
  const [attached, setAttached] = useState<Media[]>([]);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState<Media | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const submitError = createComment.error
    ? apiErrorMessage(createComment.error, "Could not post the note.")
    : uploadMedia.error
      ? apiErrorMessage(uploadMedia.error, "Could not add the photo.")
      : null;

  function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      uploadMedia.mutate(
        { file, kind: "photo" },
        { onSuccess: (item) => setAttached((prev) => [...prev, item]) },
      );
    }
  }

  function handlePost() {
    if (!body.trim() || createComment.isPending) return;
    createComment.mutate(
      {
        body: body.trim(),
        category,
        mediaIds: attached.map((item) => item.id),
        location: mapPin?.pin ?? null,
      },
      {
        onSuccess: () => {
          setBody("");
          setCategory("info");
          setAttached([]);
          setOpen(false);
          mapPin?.onClearPin();
        },
      },
    );
  }

  /** An attachment dropped before posting is nobody's, so remove it. */
  function discardAttachment(item: Media) {
    setAttached((prev) => prev.filter((m) => m.id !== item.id));
    deleteMedia.mutate(item.id);
  }

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
      >
        {isLoading ? (
          <LoadingBox size={22} />
        ) : !comments || comments.length === 0 ? (
          <EmptyState
            title="No notes on this river yet."
            caption="Hazards, conditions and access - anything worth knowing before putting on."
          />
        ) : (
          comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              /* In the overview, say which section a note came from. */
              source={
                sectionScope == null && comment.entity_type === "water_section"
                  ? sectionName(comment.entity_id)
                  : undefined
              }
              canDelete={isAdmin || comment.author_id === user?.id}
              onDelete={() => setPendingDelete(comment.id)}
              onOpenMedia={setLightbox}
              onFocusLocation={mapPin?.onFocus}
              selected={mapPin?.selectedNoteId === comment.id}
              onSelect={
                mapPin
                  ? () =>
                      mapPin.onSelectNote(
                        mapPin.selectedNoteId === comment.id
                          ? null
                          : comment.id,
                      )
                  : undefined
              }
            />
          ))
        )}
      </Box>

      {!isAuthenticated ? (
        <SignInGate icon={null} title="Sign in to add a note" pt={2} />
      ) : (
        /* Docked at the bottom of the panel, collapsed until it is used:
           a panel this narrow should show notes, not a standing form. */
        <Box
          sx={{
            flexShrink: 0,
            pt: 1.25,
            mt: 0.5,
            borderTop: "1px solid",
            borderColor: `${tokens.outlineVariant}55`,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {open && (
            <TextField
              select
              size="small"
              label="Kind"
              value={category}
              onChange={(e) => setCategory(e.target.value as CommentCategory)}
              fullWidth
              sx={selectSx}
            >
              {CATEGORY_ORDER.map((value) => (
                <MenuItem key={value} value={value} sx={menuItemSx}>
                  {categoryLabel(value)}
                </MenuItem>
              ))}
            </TextField>
          )}

          {attached.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {attached.map((item) => (
                <Box key={item.id} sx={{ position: "relative" }}>
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      border: "1px solid",
                      borderColor: `${tokens.outlineVariant}55`,
                      backgroundImage: `url(${item.thumbnail_url ?? item.url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <IconButton
                    size="small"
                    aria-label="Remove photo"
                    onClick={() => discardAttachment(item)}
                    sx={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      p: 0.25,
                      bgcolor: tokens.surface,
                      border: "1px solid",
                      borderColor: `${tokens.outlineVariant}99`,
                      "&:hover": { bgcolor: tokens.surfaceHigh },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}

          {submitError && <Alert severity="error">{submitError}</Alert>}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <TextField
            size="small"
            placeholder={
              sectionScope == null ? "Add a note" : "Add a note on this section"
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setOpen(true)}
            multiline={open}
            maxRows={4}
            fullWidth
            sx={composerSx(open)}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {mapPin && (
                      <IconButton
                        size="small"
                        aria-label={
                          mapPin.placing
                            ? "Click the map to place the pin"
                            : mapPin.pin
                              ? "Remove the map pin"
                              : "Pin a spot on the map"
                        }
                        title={
                          mapPin.placing
                            ? "Click the map to place the pin"
                            : mapPin.pin
                              ? "Remove the map pin"
                              : "Pin a spot on the map"
                        }
                        onClick={() => {
                          if (mapPin.pin) mapPin.onClearPin();
                          else {
                            setOpen(true);
                            mapPin.onTogglePlacing();
                          }
                        }}
                        sx={{
                          ...composerIconSx,
                          color:
                            mapPin.placing || mapPin.pin
                              ? tokens.tertiary
                              : "text.disabled",
                        }}
                      >
                        {mapPin.pin ? (
                          <LocationOnIcon />
                        ) : (
                          <AddLocationAltOutlinedIcon />
                        )}
                      </IconButton>
                    )}
                    <IconButton
                      size="small"
                      aria-label="Attach a photo"
                      title="Attach a photo"
                      onClick={() => {
                        setOpen(true);
                        fileInput.current?.click();
                      }}
                      disabled={uploadMedia.isPending}
                      sx={{ ...composerIconSx, color: "text.disabled" }}
                    >
                      {uploadMedia.isPending ? (
                        <CircularProgress size={15} />
                      ) : (
                        <AddPhotoAlternateOutlinedIcon />
                      )}
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="Post note"
                      title="Post note"
                      onClick={handlePost}
                      disabled={!body.trim() || createComment.isPending}
                      sx={{
                        ...composerIconSx,
                        color: tokens.tertiary,
                        "&.Mui-disabled": { color: "text.disabled" },
                      }}
                    >
                      {createComment.isPending ? (
                        <CircularProgress size={15} color="inherit" />
                      ) : (
                        <SendIcon />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      )}

      <ImageLightbox media={lightbox} onClose={() => setLightbox(null)} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this note?"
        body="It disappears for everyone, along with any photos posted with it."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        color="error"
        pending={deleteComment.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete === null) return;
          deleteComment.mutate(pendingDelete, {
            onSuccess: () => setPendingDelete(null),
          });
        }}
      />
    </Box>
  );
}
