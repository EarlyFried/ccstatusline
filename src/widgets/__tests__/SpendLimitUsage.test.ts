import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as usage from '../../utils/usage';
import { SpendLimitUsageWidget } from '../SpendLimitUsage';

let mockGetUsageErrorMessage: { mockReturnValue: (value: string) => void };

function render(widget: SpendLimitUsageWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('SpendLimitUsageWidget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetUsageErrorMessage = vi.spyOn(usage, 'getUsageErrorMessage');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders spend limit text and bar modes', () => {
        const widget = new SpendLimitUsageWidget();
        const context: RenderContext = { usageData: { spendLimitUsage: 5 } };

        expect(render(widget, { id: 'spend', type: 'spend-limit-usage' }, context)).toBe('Limit: 5%');
        expect(render(widget, {
            id: 'spend',
            rawValue: true,
            type: 'spend-limit-usage'
        }, context)).toBe('5%');
        expect(render(widget, {
            id: 'spend',
            metadata: { display: 'progress-short' },
            type: 'spend-limit-usage'
        }, context)).toBe('Limit: [█░░░░░░░░░░░░░░░] 5%');
        expect(render(widget, {
            id: 'spend',
            metadata: { display: 'slider-only' },
            type: 'spend-limit-usage'
        }, context)).toBe('Limit: ▓░░░░░░░░░');
    });

    it('renders available usage before unrelated usage errors', () => {
        const widget = new SpendLimitUsageWidget();

        expect(render(widget, { id: 'spend', type: 'spend-limit-usage' }, {
            usageData: {
                error: 'timeout',
                spendLimitUsage: 3
            }
        })).toBe('Limit: 3%');
    });

    it('shows usage error text when data is missing', () => {
        const widget = new SpendLimitUsageWidget();

        mockGetUsageErrorMessage.mockReturnValue('[Timeout]');
        expect(render(widget, { id: 'spend', type: 'spend-limit-usage' }, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
    });

    it('returns null when there is no usage data and no error', () => {
        const widget = new SpendLimitUsageWidget();

        expect(render(widget, { id: 'spend', type: 'spend-limit-usage' }, {})).toBeNull();
    });

    it('exposes progress and invert keybinds without a time cursor toggle', () => {
        const widget = new SpendLimitUsageWidget();
        const baseItem: WidgetItem = { id: 'spend', type: 'spend-limit-usage' };

        expect(widget.getCustomKeybinds(baseItem)).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'u', label: '(u) show remaining', action: 'toggle-invert' }
        ]);
        expect(widget.getCustomKeybinds({
            ...baseItem,
            metadata: { display: 'progress', invert: 'true' }
        })).toEqual([
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'u', label: '(u) show used', action: 'toggle-invert' }
        ]);
    });

    it('inverts bar rendering', () => {
        const widget = new SpendLimitUsageWidget();

        expect(render(widget, {
            id: 'spend',
            metadata: { display: 'progress-short', invert: 'true' },
            type: 'spend-limit-usage'
        }, { usageData: { spendLimitUsage: 25 } })).toBe('Limit: [████████████░░░░] 75%');
    });

    it('inverts plain text and preview rendering', () => {
        const widget = new SpendLimitUsageWidget();
        const item: WidgetItem = {
            id: 'spend',
            metadata: { invert: 'true' },
            type: 'spend-limit-usage'
        };

        expect(render(widget, item, { usageData: { spendLimitUsage: 25 } })).toBe('Limit: 75%');
        expect(render(widget, { ...item, rawValue: true }, { usageData: { spendLimitUsage: 25 } })).toBe('75%');
        expect(render(widget, item, { isPreview: true })).toBe('Limit: 95%');
    });

    it('cycles display modes in the expected order', () => {
        const widget = new SpendLimitUsageWidget();
        const baseItem: WidgetItem = { id: 'spend', type: 'spend-limit-usage' };

        const first = widget.handleEditorAction('toggle-progress', baseItem);
        const second = widget.handleEditorAction('toggle-progress', first ?? baseItem);
        const third = widget.handleEditorAction('toggle-progress', second ?? baseItem);
        const fourth = widget.handleEditorAction('toggle-progress', third ?? baseItem);
        const fifth = widget.handleEditorAction('toggle-progress', fourth ?? baseItem);

        expect(first?.metadata?.display).toBe('progress');
        expect(second?.metadata?.display).toBe('progress-short');
        expect(third?.metadata?.display).toBe('slider');
        expect(fourth?.metadata?.display).toBe('slider-only');
        expect(fifth?.metadata?.display).toBe('time');
    });

    it('supports raw values and colors', () => {
        const widget = new SpendLimitUsageWidget();

        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.supportsColors({ id: 'spend', type: 'spend-limit-usage' })).toBe(true);
        expect(widget.getDefaultColor()).toBe('yellow');
        expect(widget.getDisplayName()).toBe('Spend Limit Usage');
        expect(widget.getCategory()).toBe('Usage');
    });
});
