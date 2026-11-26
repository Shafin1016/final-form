/* Final Form — deployment settings. Safe to publish: nothing secret goes here.
   api: the backend URL, e.g. 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/ff'
        Empty = no backend: answers are checked against the built-in list only, and scores stay on this device
        (or use the Claude artifact database when the game runs inside Claude). */
window.FF_CONFIG = {
  api: 'https://shcgxmossnssipxpfpwx.supabase.co/functions/v1/ff',
  aiCheck: true,          // ask the backend about answers the built-in list doesn't know
  aiPerRound: 5,          // at most this many backend checks per round; after that, unknown answers are plain misses
  validateTimeoutMs: 4500 // give up waiting after this long (no miss is counted)
};
