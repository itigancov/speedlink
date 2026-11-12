import { registerStoragePreparation } from '@/platform/storage-preparation';

export default defineBackground(() => {
  registerStoragePreparation();
});
