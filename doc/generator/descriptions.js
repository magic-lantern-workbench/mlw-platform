// Column descriptions and table purposes, shared by the generators.

const GEN = {
  project_id: 'Identifier of the project the row belongs to (project.project_id).',
  sequence_id: 'Identifier of the sequence the row belongs to.',
  scene_id: 'Identifier of the scene the row belongs to.',
  shot_id: 'Identifier of the shot the row belongs to.',
  frame_number: 'Number of the frame within the shot.',
  start_frame: 'First frame number of the range, within the shot.',
  end_frame: 'Last frame number of the range, within the shot.',
  description: 'Free-text description of the item the row represents.',
  created_at: 'Date and time the row was created, stored as a UTC timestamp.',
};
const SPEC = {
  production: {
    sequence_id: 'Identifier of a sequence in the production. The table holds one row per sequence.',
    title: 'Title of the sequence.',
    description: 'Description of the sequence.',
  },
  sequence: {
    scene_id: 'Identifier of a scene in the sequence. The table holds one row per scene.',
    description: 'Description of the scene.',
  },
  scene: {
    shot_id: 'Identifier of a shot in the scene. The table holds one row per shot.',
    description: 'Description of the shot.',
  },
  shot: {
    shot_id: 'Identifier of the shot. The table holds one row per shot.',
    description: 'Description of the shot.',
    frame_rate: 'Frame rate of the shot in frames per second, for example 24 or 23.976.',
    start_frame: 'First frame number of the shot.',
    end_frame: 'Last frame number of the shot.',
  },
  frame: {
    layer_id: 'Layer the row belongs to (layer.layer_id). A frame has one row per layer.',
    audio_ref: 'Identifier of the audio reference attached to the frame (audio_ref.audio_ref_id).',
    dialog_ref: 'Identifier of the dialog attached to the frame (dialog.dialog_id).',
    note_ref: 'Identifier of the note attached to the frame (note.note_id).',
    description: 'Description of this layer of the frame.',
  },
  layer: {
    layer_id: 'Unique identifier of the layer within the shot.',
    name: 'Display name of the layer.',
    type: 'Kind of layer, as free text.',
    z_order: 'Stacking order of the layer within the shot.',
    visibility: 'Whether the layer is visible.',
    asset_ref: 'Identifier of the asset used by the layer (asset.asset_id).',
    description: 'Description of the layer.',
  },
  exposure_sheet: {
    xml_url: 'URL of the exposure sheet XML file.',
    svg_url: 'URL of the exposure sheet SVG file.',
    description: 'Description of the exposure sheet.',
  },
  asset: {
    asset_id: 'Unique identifier of the asset. Assets are shared across projects.',
    name: 'Display name of the asset.',
    category: 'Category the asset belongs to, as free text.',
    version: 'Version of the asset, as text (for example 1.2.0). The table holds only the current version.',
    source_url: 'URL the asset was obtained from or is stored at.',
    description: 'Description of the asset.',
  },
  audio_ref: {
    audio_ref_id: 'Unique identifier of the audio reference within the shot.',
    track: 'Identifier of the audio track being referenced (track.track_id).',
    start_frame: 'Frame at which the audio starts, within the shot.',
    end_frame: 'Frame at which the audio ends, within the shot.',
    description: 'Description of the audio reference.',
  },
  dialog: {
    dialog_id: 'Unique identifier of the dialog within the shot.',
    phoneme: 'Phoneme of the dialog, as text.',
    description: 'Description of the dialog.',
  },
  note: {
    note_id: 'Unique identifier of the note within the shot.',
    note_text: 'Text of the note.',
  },
  timeline: {
    timeline_id: 'Unique identifier of the timeline within the project.',
    position: 'Position of the entry in the timeline. Entries are read in ascending order. Use spaced values (10, 20, 30) to leave room for insertions.',
    name: 'Name of the timeline. Stored once per timeline and shared by all its entries.',
    description: 'Description of the timeline. Stored once per timeline and shared by all its entries.',
    sequence_id: 'Sequence of the frame this entry points at (frame.sequence_id).',
    scene_id: 'Scene of the frame this entry points at (frame.scene_id).',
    shot_id: 'Shot of the frame this entry points at (frame.shot_id).',
    frame_number: 'Number of the frame this entry points at (frame.frame_number). The entry covers all layers of that frame.',
  },
  camera_move: {
    camera_move_id: 'Unique identifier of the camera move within the shot.',
    type: 'Kind of camera move, as free text (for example pan or zoom).',
    start_frame: 'Frame at which the move starts, within the shot.',
    end_frame: 'Frame at which the move ends, within the shot.',
    description: 'Description of the camera move.',
  },
  keyframe: {
    keyframe_id: 'Unique identifier of the keyframe within the shot.',
    frame_number: 'Frame number of the keyframe, within the shot.',
    x: 'X position of the camera at the keyframe.',
    y: 'Y position of the camera at the keyframe.',
    z: 'Z position of the camera at the keyframe.',
    zoom: 'Zoom factor of the camera at the keyframe.',
    focal_length: 'Focal length of the camera at the keyframe.',
    interpolation: 'How values are interpolated from this keyframe to the next, as free text (for example linear).',
    note: 'Note about the keyframe.',
    description: 'Description of the keyframe.',
  },
  camera: {
    camera_id: 'Unique identifier of the camera within the shot.',
    name: 'Display name of the camera.',
    projection: 'Projection used by the camera, as free text (for example perspective or orthographic).',
    move_refs: 'Ordered list of camera moves belonging to the camera (camera_move.camera_move_id).',
    keyframe_refs: 'Ordered list of keyframes belonging to the camera (keyframe.keyframe_id).',
    description: 'Description of the camera.',
  },
  user: {
    user_id: 'Unique identifier of the user.',
    username: 'Login name of the user.',
    email: 'Email address of the user. Also the key of user_by_email.',
    display_name: 'Name shown for the user.',
    role: 'Role of the user in the application, as free text (for example admin or artist).',
    created_at: 'Date and time the user was created, stored as a UTC timestamp.',
    description: 'Description of the user.',
  },
  user_by_email: {
    email: 'Email address to look up (user.email).',
    user_id: 'Identifier of the user with that email address (user.user_id).',
  },
  project: {
    name: 'Display name of the project.',
    status: 'Status of the project, as free text (for example active or archived).',
    owner_id: 'Identifier of the user who owns the project (user.user_id).',
    created_at: 'Date and time the project was created, stored as a UTC timestamp.',
    description: 'Description of the project.',
  },
  project_member: {
    user_id: 'Identifier of the member (user.user_id). The table holds one row per member.',
    role: 'Role of the member in this project, as free text.',
    added_at: 'Date and time the member was added, stored as a UTC timestamp.',
  },
  project_by_user: {
    user_id: 'Identifier of the user (user.user_id).',
    project_id: 'Identifier of a project the user belongs to (project.project_id). The table holds one row per project.',
    role: 'Role of the user in the project. Copied from project_member.',
    added_at: 'Date and time the user was added to the project. Copied from project_member.',
  },
  review: {
    review_id: 'Unique identifier of the review within the project.',
    sequence_id: 'Sequence of the reviewed frame (frame.sequence_id).',
    scene_id: 'Scene of the reviewed frame (frame.scene_id).',
    shot_id: 'Shot of the reviewed frame (frame.shot_id).',
    frame_number: 'Number of the reviewed frame (frame.frame_number).',
    reviewer: 'Identifier of the user doing the review (user.user_id).',
    status: 'Status of the review, as free text (for example pending, approved or rejected).',
    comment_refs: 'Ordered list of comments on the review (comment.comment_id).',
    description: 'Description of the review.',
  },
  comment: {
    comment_id: 'Unique identifier of the comment within the project.',
    comment_text: 'Text of the comment.',
  },
  review_by_frame: {
    review_id: 'Identifier of a review of the frame (review.review_id). The table holds one row per review.',
    reviewer: 'Identifier of the reviewer. Copied from review.',
    status: 'Status of the review. Copied from review.',
    frame_number: 'Number of the reviewed frame (frame.frame_number).',
  },
  track: {
    track_id: 'Unique identifier of the audio track. Tracks are shared across projects.',
    name: 'Display name of the track.',
    type: 'Kind of track, as free text (for example music, dialog or effects).',
    file_name: 'Original name of the audio file.',
    url: 'URL of the audio file.',
    description: 'Description of the track.',
  },
  audio_tracks: {
    audio_tracks_id: 'Unique identifier of the group of audio tracks. Groups are shared across projects.',
    position: 'Position of the entry in the group. Entries are read in ascending order.',
    description: 'Description of the group. Stored once per group and shared by all its entries.',
    track_id: 'Identifier of the track in this entry (track.track_id).',
  },
  version_control: {
    version_control_id: 'Unique identifier of the version control within the project.',
    description: 'Description of the version control.',
  },
  revision: {
    version_control_id: 'Identifier of the version control the revision belongs to (version_control.version_control_id).',
    revision_number: 'Revision number. Revisions are read newest first.',
    author: 'Identifier of the user who made the revision (user.user_id).',
    created_at: 'Date and time of the revision, stored as a UTC timestamp.',
    description: 'Descriptive text for the revision.',
  },
};
function describe(table, col) {
  const s = SPEC[table] && SPEC[table][col];
  if (s) return s;
  if (GEN[col]) return GEN[col];
  const own = col.endsWith('_id') ? `Unique identifier of the ${table.replace(/_/g, ' ')}.` : null;
  if (own) return own;
  throw new Error(`no description for ${table}.${col}`);
}

const PURPOSE = {
  production: 'Holds the production hierarchy at its top level. A production is one or more sequences, so the table has one row per sequence, partitioned by project. Reading one partition returns all sequences of a project in order.',
  sequence: 'A sequence is one or more scenes. The table has one row per scene, partitioned by project and sequence, so one query returns all scenes of a sequence.',
  scene: 'A scene is one or more shots. The table has one row per shot, partitioned by project, sequence and scene, so one query returns all shots of a scene.',
  shot: 'Holds the attributes of a single shot: its frame rate and its first and last frame. There is one row per shot, found by the full shot key.',
  frame: 'A shot is a list of frames. The table has one row per layer of each frame, partitioned by shot and ordered by frame number and then layer. It references audio, dialog and notes attached to the frame.',
  layer: 'Layers available to a shot, one row per layer, partitioned by shot. A layer can use an asset.',
  exposure_sheet: 'Exposure sheet of a shot, held as references to an XML file and an SVG file. There is one row per shot.',
  asset: 'Reusable assets, one row per asset. Assets are not tied to a project, so they can be shared by all projects.',
  audio_ref: 'Audio attached to frames of a shot. Each row names an audio track and the range of frames it covers. Partitioned by shot.',
  dialog: 'Dialog attached to frames of a shot, held as a phoneme. Partitioned by shot.',
  note: 'Notes attached to frames of a shot. A note holds only text. Partitioned by shot.',
  timeline: 'A timeline is an ordered sequence of frames. The table has one row per entry, partitioned by timeline and ordered by position. Each entry points at a frame by its sequence, scene, shot and frame number.',
  camera_move: 'Camera moves of a shot, such as a pan or zoom, with the frame range they cover. Partitioned by shot.',
  keyframe: 'Camera keyframes of a shot: the camera position, zoom and focal length at a frame number, and how values are interpolated to the next keyframe. Partitioned by shot.',
  camera: 'A camera of a shot. A camera is a collection of camera moves and keyframes, held as ordered lists of their identifiers. Partitioned by shot.',
  user: 'Application users, one row per user, found by user identifier. No credentials are stored.',
  user_by_email: 'Lookup table that finds a user by email address. It duplicates data from user and must be kept in sync with it.',
  project: 'Projects, one row per project, found by project identifier. Every table that has a project_id column refers to this table.',
  project_member: 'The users who work on a project, one row per member, partitioned by project. Reading one partition lists the members of a project.',
  project_by_user: 'Lookup table that lists the projects a user belongs to, one row per project, partitioned by user. It duplicates data from project_member and must be kept in sync with it.',
  review: 'Reviews of frames, one row per review, partitioned by project. A review points at a frame, names a reviewer and has a status, and refers to its comments.',
  comment: 'Text of comments on reviews. A review refers to its comments through review.comment_refs.',
  review_by_frame: 'Lookup table that lists the reviews of a frame, one row per review, partitioned by frame. It duplicates data from review and must be kept in sync with it.',
  track: 'Audio tracks, one row per track. Tracks are shared across projects. A track points at its audio file by URL.',
  audio_tracks: 'A group of audio tracks, shared across projects. The table has one row per entry, partitioned by group and ordered by position. Each entry points at a track.',
  version_control: 'Version control of a project, one row per version control. Its revisions are the rows of revision that share its key.',
  revision: 'Revisions of a version control, one row per revision, partitioned by version control and read newest first.',
};


module.exports = { describe, PURPOSE };
