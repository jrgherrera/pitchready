export function getAvatarUrl(id: string, photoURL?: string | null) {
  if (photoURL && photoURL.trim()) {
    return photoURL;
  }
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(id)}`;
}
