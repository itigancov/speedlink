export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    if (__SPEEDLINK_E2E_THROW__) {
      throw new Error('speedlink-e2e-negative-control');
    }
  },
});
