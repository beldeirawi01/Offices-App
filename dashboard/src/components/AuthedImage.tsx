import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * The documentation photo endpoint sits behind the same JWT auth as the rest
 * of the API (this is liability evidence, not a shareable client link), so a
 * plain <img src> can't carry the Authorization header. Fetch it as a blob
 * and hand the browser an object URL instead.
 */
export default function AuthedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setFailed(false);
    setObjectUrl(null);

    api
      .get(src, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.data);
        setObjectUrl(url);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  if (failed) return <div className={className}>Photo unavailable</div>;
  if (!objectUrl) return <div className={className}>Loading...</div>;
  return <img src={objectUrl} alt={alt} className={className} />;
}
