import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StatsBarChart, StatsBarDatum } from '../../src/ui/components/StatsBarChart.tsx';
import { SpriteGallery } from '../../src/ui/components/civilization/SpriteGallery.tsx';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { translate } from '../../src/i18n/translator.ts';

function makeBars(count: number, withZeros = true): StatsBarDatum[] {
  return Array.from({ length: count }, (_, idx) => ({
    key: `item-${idx + 1}`,
    label: `2026-11-${String(idx + 1).padStart(2, '0')}`,
    axisLabel: `${idx + 1}`,
    value: withZeros && idx % 5 === 2 ? 0 : 20 + (idx % 6) * 15,
    sessions: withZeros && idx % 5 === 2 ? 0 : 1 + (idx % 3),
    isCurrent: idx === count - 1,
  }));
}

test('StatsBarChart Stage 3: pure SVG zero-dependency implementation with reduced-motion & no hardcoded UI text', () => {
  const chartPath = path.resolve(import.meta.dirname, '../../src/ui/components/StatsBarChart.tsx');
  const src = fs.readFileSync(chartPath, 'utf8');

  assert.equal(/recharts|chart\.js|victory|nivo|echarts|d3-/.test(src), false);
  assert.ok(src.includes('motion-reduce:transition-none'), 'Must respect prefers-reduced-motion');
  assert.equal(/No data|Chưa có dữ liệu|Focus minutes bar chart/i.test(src), false, 'UI text must come from props/i18n');

  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf8')
  ) as { dependencies?: Record<string, string> };
  const deps = Object.keys(pkg.dependencies ?? {});
  assert.equal(deps.some((d) => /chart|recharts|d3|echarts|victory/i.test(d)), false);
});

test('StatsBarChart Stage 3: renders 7, 12, and 30 bars with sparse non-overlapping X-axis labels', () => {
  const bars7 = makeBars(7);
  const html7 = renderToString(
    React.createElement(StatsBarChart, {
      bars: bars7,
      ariaLabel: '7-day chart',
      emptyLabel: 'No data yet',
      tooltipFormatter: (b) => `${b.value} mins · ${b.sessions ?? 0} sessions`,
    })
  );
  assert.equal((html7.match(/data-bar-key="/g) ?? []).length, 7);
  assert.equal((html7.match(/data-x-label="/g) ?? []).length, 7);
  assert.ok(html7.includes('data-zero-bar="true"'), 'Zero bar must show clear baseline marker');

  const bars12 = makeBars(12);
  const html12 = renderToString(
    React.createElement(StatsBarChart, {
      bars: bars12,
      highlightKey: 'item-12',
      ariaLabel: '12-month chart',
      emptyLabel: 'No data yet',
    })
  );
  assert.equal((html12.match(/data-bar-key="/g) ?? []).length, 12);
  assert.equal((html12.match(/data-x-label="/g) ?? []).length, 12);
  assert.ok(html12.includes('data-bar-key="item-12" data-highlighted="true"'));
  assert.ok(html12.includes('fill="#a5b4fc"'));

  const bars30 = makeBars(30);
  const html30 = renderToString(
    React.createElement(StatsBarChart, {
      bars: bars30,
      ariaLabel: '30-day chart',
      emptyLabel: 'No data yet',
    })
  );
  assert.equal((html30.match(/data-bar-key="/g) ?? []).length, 30);
  const xLabelCount30 = (html30.match(/data-x-label="/g) ?? []).length;
  assert.ok(
    xLabelCount30 >= 5 && xLabelCount30 <= 8,
    `30-bar chart must render sparse non-overlapping X labels (got ${xLabelCount30})`
  );
  assert.ok(html30.includes('data-x-label="1"'));
  assert.ok(html30.includes('data-x-label="30"'));
});

test('StatsBarChart Stage 3: focusable accessible bars with bilingual EN/VI aria-label & localized empty states', () => {
  const sampleBars: StatsBarDatum[] = [
    { key: '2026-11-16', label: '2026-11-16', axisLabel: '11-16', value: 60, sessions: 2 },
    { key: '2026-11-17', label: '2026-11-17', axisLabel: '11-17', value: 90, sessions: 3, isCurrent: true },
  ];

  const htmlVi = renderToString(
    React.createElement(StatsBarChart, {
      bars: sampleBars,
      ariaLabel: translate('vi', 'stats.chart.ariaLabel'),
      emptyLabel: translate('vi', 'stats.chart.empty'),
      tooltipFormatter: (b) =>
        translate('vi', 'stats.chart.tooltip', {
          minutes: b.value,
          sessions: b.sessions ?? 0,
        }),
    })
  );
  assert.ok(htmlVi.includes('role="img"'));
  assert.ok(htmlVi.includes('aria-label="Biểu đồ cột số phút tập trung"'));
  assert.ok(htmlVi.includes('tabindex="0"'));
  assert.ok(htmlVi.includes('role="button"'));
  assert.ok(htmlVi.includes('aria-label="2026-11-16: 60 phút · 2 phiên"'));
  assert.ok(htmlVi.includes('aria-label="2026-11-17: 90 phút · 3 phiên"'));

  const emptyEn = renderToString(
    React.createElement(StatsBarChart, {
      bars: [],
      ariaLabel: translate('en', 'stats.chart.ariaLabel'),
      emptyLabel: translate('en', 'stats.chart.empty'),
    })
  );
  assert.ok(emptyEn.includes('data-testid="stats-bar-chart-empty"'));
  assert.ok(emptyEn.includes('No data yet'));

  const allZeroVi = renderToString(
    React.createElement(StatsBarChart, {
      bars: [{ key: 'd1', label: '2026-11-17', value: 0, sessions: 0 }],
      ariaLabel: translate('vi', 'stats.chart.ariaLabel'),
      emptyLabel: translate('vi', 'stats.chart.empty'),
    })
  );
  assert.ok(allZeroVi.includes('data-testid="stats-bar-chart-empty"'));
  assert.ok(allZeroVi.includes('Chưa có dữ liệu'));
});

test('SpriteGallery Stage 3: #sprites renders 7/30/12-bar SVG chart preview cleanly in EN & VI', () => {
  const enGallery = renderToString(
    React.createElement(I18nProvider, { locale: 'en' }, React.createElement(SpriteGallery))
  );
  assert.ok(enGallery.includes('data-testid="gallery-stats-bar-chart-preview"'));
  assert.ok(enGallery.includes('Day Trend · 7 Bars'));
  assert.ok(enGallery.includes('Month Daily · 30 Bars'));
  assert.ok(enGallery.includes('Year Monthly · 12 Bars'));
  assert.ok(!enGallery.includes('data-tile-index="27"'));

  const viGallery = renderToString(
    React.createElement(I18nProvider, { locale: 'vi' }, React.createElement(SpriteGallery))
  );
  assert.ok(viGallery.includes('Xu hướng Ngày · 7 Cột'));
  assert.ok(viGallery.includes('Ngày trong Tháng · 30 Cột'));
  assert.ok(viGallery.includes('Tháng trong Năm · 12 Cột'));
});
