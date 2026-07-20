import { QRCodeSVG } from 'qrcode.react';

/**
 * A scannable QR block. Rendered locally (qrcode.react) — never sent to a
 * third-party QR service, which matters for a privacy app. Kept on a white
 * plate with dark modules so it scans reliably in both light and dark themes.
 */
export function QRCode({
  value,
  size = 168,
  className = '',
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-[3px] border border-ink-700 bg-white p-3 ${className}`}
    >
      <QRCodeSVG value={value} size={size} level="M" bgColor="#ffffff" fgColor="#0b0c0e" marginSize={0} />
    </div>
  );
}
