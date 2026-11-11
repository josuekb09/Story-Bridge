export const AUDIENCE_CHOICES = ['public', 'members', 'private'];

export function audienceFields(choice) {
  if (!AUDIENCE_CHOICES.includes(choice)) throw new TypeError('Choose a valid audience.');
  return {
    visibility: choice === 'private' ? 'private' : 'public',
    access: choice === 'members' ? 'Community only' : 'Public',
    requestedVisibility: choice === 'private' ? 'private' : 'public',
  };
}

export function audienceFromStory(story = {}) {
  if (story.visibility !== 'public') return 'private';
  return story.access === 'Community only' ? 'members' : 'public';
}

export function requestedAudienceFromStory(story = {}) {
  if (story.status === 'withdrawn') return 'private';
  if (story.requestedVisibility === 'public' || story.visibility === 'public') {
    return story.access === 'Community only' ? 'members' : 'public';
  }
  return 'private';
}

export function audienceLabelKey(choice) {
  return `audience.${AUDIENCE_CHOICES.includes(choice) ? choice : 'private'}`;
}

export function audienceLine(story, t) {
  if (story?.moderationStatus === 'pending_review') {
    const choice = t(audienceLabelKey(requestedAudienceFromStory(story)));
    return t('audience.pending').replace('{choice}', choice);
  }
  const choice = t(audienceLabelKey(audienceFromStory(story)));
  return t('audience.whoCanSee').replace('{choice}', choice);
}
