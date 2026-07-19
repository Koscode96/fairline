/** Shareable X-ray: the whole verdict lives in the link. */
export interface SharedXray {
  v: 1;
  legs: Array<{ label: string; bookie: number; fair: number; matched: boolean }>;
  acca: number;
  stake: number;
}
export const encodeXray = (x: SharedXray): string =>
  btoa(unescape(encodeURIComponent(JSON.stringify(x)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const decodeXray = (s: string): SharedXray | null => {
  try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); }
  catch { return null; }
};
