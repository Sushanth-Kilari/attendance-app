"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshCheckinToken, stopCheckin } from "./actions";

const REFRESH_INTERVAL_MS = 20_000;

export function CheckinQrPanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function tick() {
    const res = await refreshCheckinToken(sessionId);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    const url = `${window.location.origin}/checkin/${sessionId}?t=${res.token}`;
    const svg = await QRCode.toDataURL(url, { margin: 1, width: 220 });
    setDataUrl(svg);
  }

  function show() {
    setOpen(true);
    tick();
    intervalRef.current = setInterval(tick, REFRESH_INTERVAL_MS);
  }

  function hide() {
    setOpen(false);
    setDataUrl(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    stopCheckin(sessionId);
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={show}>
        <QrCode className="size-4" />
        Show self check-in QR
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex w-full items-center justify-between">
        <p className="text-sm font-medium text-foreground">Scan to check in</p>
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={hide}>
          <X className="size-4" />
        </Button>
      </div>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a QR data URL isn't a static asset Next's Image can optimize
        <img src={dataUrl} alt="Self check-in QR code" width={220} height={220} className="rounded-lg" />
      ) : (
        <div className="flex size-[220px] items-center justify-center text-sm text-muted-foreground">Loading…</div>
      )}
      <p className="max-w-[220px] text-center text-xs text-muted-foreground">
        Only works on the college network. Refreshes automatically — a screenshot stops working within seconds.
      </p>
    </div>
  );
}
