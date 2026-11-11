export function isPublicPostMedia(story) {
  return story?.status === 'shared'
    && story.visibility === 'public'
    && story.access === 'Public'
    && story.mediaRequiresSession !== true
    && story.moderationStatus !== 'pending_review';
}
