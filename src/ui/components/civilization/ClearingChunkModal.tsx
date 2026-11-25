import React, { useEffect, useRef, useState } from 'react';
import { X, Compass, Trash2 } from 'lucide-react';
import { ConstructionJob } from '../../../core/civilization/jobs.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import { formatRewardAmount } from '../../utils/formatters.ts';
import { formatJobCountdown, getCancelJobRefundPreview } from './jobProjection.ts';
import { CLOCK_TILE_INDEX, ClockTileIcon } from './spriteRegistry.ts';

export interface ClearingChunkModalProps {
  job: ConstructionJob | null;
  allJobs?: readonly ConstructionJob[];
  onClose: () => void;
  onCancelJob: (jobId: string) => Promise<void>;
  isSubmitting?: boolean;
}

export const ClearingChunkModal: React.FC<ClearingChunkModalProps> = ({
  job,
  allJobs = [],
  onClose,
  onCancelJob,
  isSubmitting = false,
}) => {
  const { t } = useTranslation();
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelLockRef = useRef(false);

  useEffect(() => {
    setIsCancelling(false);
    cancelLockRef.current = false;
  }, [job?.id]);

  if (!job || job.kind !== 'expand' || !job.origin) {
    return null;
  }

  const isActive = job.status === 'ACTIVE';
  const refundPreview = getCancelJobRefundPreview(job, allJobs);
  const formattedRefund = formatRewardAmount(refundPreview.refundCoins);
  const formattedPaid = formatRewardAmount(job.paidCoins);
  const busy = isSubmitting || isCancelling;

  const handleCancelClick = async () => {
    if (busy || cancelLockRef.current) return;
    cancelLockRef.current = true;
    setIsCancelling(true);
    try {
      await onCancelJob(job.id);
    } finally {
      cancelLockRef.current = false;
      setIsCancelling(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clearing-chunk-title"
      data-testid="clearing-chunk-modal"
      onClick={busy ? undefined : onClose}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[1px] p-3"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[320px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="clearing-chunk-title"
                className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                {t('civ.clearingModal.title')}
              </h2>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {`(${job.origin.x}, ${job.origin.y})`}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            aria-label={t('civ.clearingModal.closeAria')}
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                {t('civ.clearingModal.statusLabel')}
              </span>
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  isActive
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <ClockTileIcon
                  tileIndex={isActive ? CLOCK_TILE_INDEX.CLOCK : CLOCK_TILE_INDEX.HOURGLASS}
                  size={12}
                />
                <span>
                  {isActive
                    ? t('civ.clearingModal.statusActive')
                    : t('civ.clearingModal.statusPending')}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                {t('civ.clearingModal.crewLabel')}
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                {t('civ.clearingModal.crewValue', { crew: job.crewRequired })}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                {t('civ.clearingModal.remainingLabel')}
              </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatJobCountdown(job.remainingSeconds)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                {t('civ.clearingModal.paidLabel')}
              </span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                {t('civ.expand.costValue', { cost: formattedPaid })}
              </span>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
            {t('civ.clearingModal.cancelNote')}
          </p>

          <button
            type="button"
            data-testid="clearing-cancel-btn"
            disabled={busy}
            onClick={handleCancelClick}
            className="w-full py-2 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isCancelling
                ? t('civ.clearingModal.cancellingBtn')
                : t('civ.clearingModal.cancelBtn', { refund: formattedRefund })}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
