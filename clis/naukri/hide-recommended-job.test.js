import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { HIDE_RECOMMENDED_JOB_COLUMNS } from './hide-recommended-job.js';
import './hide-recommended-job.js';

const {
  buildHideRecommendedJobScript,
  buildVisibleTextAfterTabsScript,
  parseHideRecommendedJobResult,
  requireJobId,
  readSettleSeconds,
  splitTabs,
} = await import('./hide-recommended-job.js').then((m) => m.__test__);

describe('naukri hide-recommended-job adapter', () => {
  const command = getRegistry().get('naukri/hide-recommended-job');

  it('registers guarded write command shape', () => {
    expect(command).toBeDefined();
    expect(command.access).toBe('write');
    expect(command.strategy).toBe('cookie');
    expect(command.browser).toBe(true);
    expect(command.navigateBefore).toBe(false);
    expect(command.columns).toEqual(HIDE_RECOMMENDED_JOB_COLUMNS);
    expect(command.args.map((arg) => arg.name)).toEqual(['job-id', 'title', 'company', 'tabs', 'settle-seconds', 'execute']);
  });

  it('normalizes tab aliases', () => {
    expect(splitTabs('profile,Top Candidate,you might like')).toEqual([
      'profile',
      'top-candidate',
      'you-might-like',
    ]);
    expect(splitTabs('')).toEqual(['all']);
  });

  it('validates job id', () => {
    expect(requireJobId(' 220526012693 ')).toBe('220526012693');
    expect(() => requireJobId('')).toThrow(ArgumentError);
    expect(() => requireJobId('abc')).toThrow(ArgumentError);
  });

  it('validates settle seconds', () => {
    expect(readSettleSeconds(undefined)).toBe(5);
    expect(readSettleSeconds(3)).toBe(3);
    expect(() => readSettleSeconds(0)).toThrow(ArgumentError);
    expect(() => readSettleSeconds(16)).toThrow(ArgumentError);
  });

  it('maps dry-run and execute results', () => {
    const payload = {
      ok: true,
      job_id: '220526012693',
      title: 'Fullstack Developer',
      company: 'Digitide Solutions',
      tab: 'Profile',
    };
    expect(parseHideRecommendedJobResult(payload, '220526012693', false)).toEqual([{
      status: 'dry-run',
      job_id: '220526012693',
      title: 'Fullstack Developer',
      company: 'Digitide Solutions',
      tab: 'Profile',
      action: 'would-hide',
    }]);
    expect(parseHideRecommendedJobResult(payload, '220526012693', true)[0]).toMatchObject({
      status: 'hidden',
      action: 'hide',
    });
  });

  it('builds execute script with a page-click selector marker', () => {
    const script = buildHideRecommendedJobScript({
      jobId: '220526019476',
      title: 'Fullstack Engineer-AWS',
      company: 'NTT DATA',
      tabs: ['profile'],
      execute: true,
    });
    expect(script).toContain('data-opencli-hide-recommended-job-target');
    expect(script).toContain("closest('button,a,[role=\"button\"],[onclick]");
  });

  it('builds verification script that reads selected tab text', () => {
    const script = buildVisibleTextAfterTabsScript(['top-candidate']);
    expect(script).toContain('Top Candidate');
    expect(script).toContain("texts.join(' ')");
  });

  it('raises auth and command failures from page payloads', () => {
    expect(() => parseHideRecommendedJobResult({
      url: 'https://www.naukri.com/nlogin/login',
      title: 'Login | Naukri',
      text: 'Login Sign in Register',
    }, '220526012693', false)).toThrow(AuthRequiredError);
    expect(() => parseHideRecommendedJobResult({
      ok: false,
      error: 'job_not_found',
      job_id: '220526012693',
    }, '220526012693', false)).toThrow(CommandExecutionError);
    expect(() => parseHideRecommendedJobResult({
      ok: true,
      job_id: '190526027384',
    }, '220526012693', false)).toThrow(CommandExecutionError);
  });

  it('dry-runs by default and refuses execute without a title/company guard', async () => {
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      click: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({
        ok: true,
        job_id: '220526012693',
        title: 'Fullstack Developer',
        company: 'Digitide Solutions',
        tab: 'Profile',
      })),
    };
    await expect(command.func(page, { 'job-id': '220526012693', tabs: 'profile' })).resolves.toEqual([
      expect.objectContaining({ status: 'dry-run', action: 'would-hide' }),
    ]);
    expect(page.goto).toHaveBeenCalledWith('https://www.naukri.com/mnjuser/recommendedjobs');

    await expect(command.func(page, { 'job-id': '220526012693', execute: true })).rejects.toThrow('Refusing to hide without a guard');
  });
});
