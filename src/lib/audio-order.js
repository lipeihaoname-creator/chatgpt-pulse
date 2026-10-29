// Capture epochs order restarts; sequences order samples and status events.
// A delayed status snapshot must never roll back a more recent live event.
export function acceptAudio(previous,next){
 if(!next||!Number.isSafeInteger(next.epoch)||next.epoch<0||!Number.isSafeInteger(next.sequence)||next.sequence<0)return false;
 return !previous||next.epoch>previous.epoch||next.epoch===previous.epoch&&next.sequence>=previous.sequence;
}
