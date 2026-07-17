'use client';

import { useEffect, useState } from 'react';
import Sheet from './ui/Sheet';
import Button from './ui/Button';
import { Textarea } from './ui/Field';

interface Props {
  open: boolean;
  /** e.g. "Today" or "Mon, Jul 14" — shown under the title. */
  dateLabel?: string;
  /** Pre-fill when editing an existing rest day's note. */
  initialReason?: string;
  /** Disables the buttons while the write is in flight. */
  saving?: boolean;
  onSave: (reason: string) => void;
  onClose: () => void;
}

/**
 * The reason prompt shown when marking a day as a rest-day exception. A short
 * note ("why") is optional but encouraged. Shared by the Today row, the habit
 * calendar, and the custom-habit rest-day editor so the flow is identical
 * everywhere.
 */
export default function RestDaySheet({
  open,
  dateLabel,
  initialReason = '',
  saving = false,
  onSave,
  onClose,
}: Props) {
  const [reason, setReason] = useState(initialReason);

  // Reset the field whenever the sheet (re)opens for a new/edited day.
  useEffect(() => {
    if (open) setReason(initialReason);
  }, [open, initialReason]);

  return (
    <Sheet open={open} onClose={onClose} title="Mark a rest day">
      {dateLabel && (
        <p className="mb-3 text-center text-xs text-text-muted">{dateLabel}</p>
      )}
      <Textarea
        label="Reason (optional)"
        placeholder="Why are you skipping? e.g. sick, travelling, planned rest"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        autoFocus
        disabled={saving}
      />
      <p className="mt-2 text-xs text-text-muted">
        This day won&apos;t count against your streak.
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          variant="secondary"
          fullWidth
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button fullWidth onClick={() => onSave(reason.trim())} loading={saving}>
          Save rest day
        </Button>
      </div>
    </Sheet>
  );
}
