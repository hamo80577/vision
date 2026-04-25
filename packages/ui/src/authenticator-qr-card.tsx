"use client";

import { useEffect, useState } from "react";

import QRCode from "qrcode";

import { cn } from "./cn";
import { LoadingSkeleton } from "./loading-skeleton";

type AuthenticatorQrCardProps = {
  className?: string;
  description?: string;
  manualEntryKey?: string | null;
  otpauthUrl?: string | null;
  title?: string;
};

export function AuthenticatorQrCard({
  className,
  description = "Scan this code with your authenticator app.",
  manualEntryKey,
  otpauthUrl,
  title = "Authenticator QR",
}: AuthenticatorQrCardProps) {
  const [qrCodeSrc, setQrCodeSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function buildQrCode() {
      if (!otpauthUrl) {
        setQrCodeSrc(null);
        return;
      }

      try {
        const nextSrc = await QRCode.toDataURL(otpauthUrl, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 180,
        });

        if (active) {
          setQrCodeSrc(nextSrc);
        }
      } catch {
        if (active) {
          setQrCodeSrc(null);
        }
      }
    }

    void buildQrCode();

    return () => {
      active = false;
    };
  }, [otpauthUrl]);

  return (
    <div className={cn("ui-auth-qr", className)}>
      <div className="ui-auth-qr__media">
        {qrCodeSrc ? (
          <img alt={title} className="ui-auth-qr__image" src={qrCodeSrc} />
        ) : (
          <div className="ui-auth-qr__loading">
            <LoadingSkeleton rows={3} />
          </div>
        )}
      </div>
      <div className="ui-auth-qr__copy">
        <span className="ui-auth-qr__title">{title}</span>
        <p className="ui-auth-qr__description">{description}</p>
        {manualEntryKey ? (
          <div className="ui-auth-qr__fallback">
            <span className="ui-auth-qr__label">Manual entry key</span>
            <p className="ui-auth-qr__key">{manualEntryKey}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
