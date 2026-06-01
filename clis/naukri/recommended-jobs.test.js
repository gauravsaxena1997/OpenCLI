import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { RECOMMENDED_JOB_COLUMNS } from './recommended-jobs.js';
import './recommended-jobs.js';

const {
  extractJobId,
  parseRecommendedJobsPayload,
  splitTabs,
} = await import('./recommended-jobs.js').then((m) => m.__test__);

const SAMPLE_PAYLOAD = {
  url: 'https://www.naukri.com/mnjuser/recommendedjobs',
  title: 'Recommended Jobs | Naukri',
  text: 'Recommended Jobs',
  items: [
    {
      tab: 'Profile',
      title: 'Senior Full Stack Developer',
      company: 'Acme Software Posted by Acme Recruiter',
      location: 'Remote, India',
      experience: '5-8 Yrs',
      salary: 'Not disclosed',
      posted: 'Posted 2 days ago',
      description: 'Build React and Node.js products with TypeScript and AWS.',
      skills: ['React', 'Node.js', 'TypeScript'],
      company_rating: '4.1',
      reviews_count: '21 Reviews',
      notice_period_signal: 'Immediate joiner preferred',
      apply_state: 'Save',
      is_selected: false,
      can_select: true,
      job_url: '/job-listings-senior-full-stack-developer-acme-software-remote-010126000001',
      source_url: 'https://www.naukri.com/mnjuser/recommendedjobs',
      raw_text: 'Senior Full Stack Developer\nAcme Software\n5-8 Yrs\nRemote, India\nNot disclosed\nImmediate joiner preferred\nPosted 2 days ago\nSave\nHide',
    },
    {
      tab: 'Profile',
      raw_text: 'Backend Engineer\nBuilder Labs\n3-6 Yrs\nBengaluru\n₹ 20-35 Lacs PA\nPosted 1 week ago\nSave',
      job_url: 'https://www.naukri.com/job-listings-backend-engineer-builder-labs-bengaluru-010126000002?src=rec',
      can_select: true,
    },
    {
      tab: 'Preferences',
      title: 'React Engineer',
      company: 'Frontend Labs 4.2 15 Reviews',
      raw_text: 'React Engineer\nFrontend Labs\n4-7 Yrs\nHybrid - Pune\nFew Hours Ago\nSave',
      job_url: 'https://www.naukri.com/job-listings-react-engineer-frontend-labs-pune-010126000003',
    },
  ],
};

describe('naukri recommended-jobs adapter', () => {
  const command = getRegistry().get('naukri/recommended-jobs');

  it('registers command shape', () => {
    expect(command).toBeDefined();
    expect(command.access).toBe('read');
    expect(command.strategy).toBe('cookie');
    expect(command.browser).toBe(true);
    expect(command.navigateBefore).toBe(false);
    expect(command.columns).toEqual(RECOMMENDED_JOB_COLUMNS);
    expect(command.args.map((arg) => arg.name)).toEqual(['tabs', 'limit-per-tab']);
  });

  it('normalizes tab aliases', () => {
    expect(splitTabs('profile,Top Candidate,preferences,you might like')).toEqual([
      'profile',
      'top-candidate',
      'preferences',
      'you-might-like',
    ]);
    expect(splitTabs('')).toEqual(['all']);
  });

  it('extracts job ids from canonical Naukri URLs', () => {
    expect(extractJobId('https://www.naukri.com/job-listings-backend-engineer-builder-labs-bengaluru-010126000002?src=rec')).toBe('010126000002');
    expect(extractJobId('https://www.naukri.com/jobdetail?jobId=123456789')).toBe('123456789');
  });

  it('normalizes extracted recommended job cards with rich fields', () => {
    const rows = parseRecommendedJobsPayload(SAMPLE_PAYLOAD, 10);
    expect(rows).toHaveLength(3);
    expect(Object.keys(rows[0])).toEqual(RECOMMENDED_JOB_COLUMNS);
    expect(rows[0]).toMatchObject({
      tab: 'Profile',
      rank: '1',
      title: 'Senior Full Stack Developer',
      company: 'Acme Software',
      location: 'Remote, India',
      experience: '5-8 Yrs',
      salary: 'Not disclosed',
      posted: 'Posted 2 days ago',
      description: 'Build React and Node.js products with TypeScript and AWS.',
      skills: 'React, Node.js, TypeScript',
      recruiter_or_posted_by: 'Posted by Acme Recruiter',
      company_rating: '4.1',
      reviews_count: '21 Reviews',
      work_mode: 'Remote',
      notice_period_signal: 'Immediate joiner preferred',
      apply_state: 'Save',
      is_selected: 'false',
      can_select: 'true',
      job_url: 'https://www.naukri.com/job-listings-senior-full-stack-developer-acme-software-remote-010126000001',
      job_id: '010126000001',
    });
    expect(rows[1]).toMatchObject({
      tab: 'Profile',
      rank: '2',
      title: 'Backend Engineer',
      company: 'Builder Labs',
      location: 'Bengaluru',
      experience: '3-6 Yrs',
      salary: '₹ 20-35 Lacs PA',
      posted: 'Posted 1 week ago',
      apply_state: 'Save',
      can_select: 'true',
      job_url: 'https://www.naukri.com/job-listings-backend-engineer-builder-labs-bengaluru-010126000002',
    });
    expect(rows[2]).toMatchObject({
      tab: 'Preferences',
      rank: '1',
      title: 'React Engineer',
      company: 'Frontend Labs',
      company_rating: '4.2',
      reviews_count: '15 Reviews',
    });
  });

  it('applies limit per tab, not globally', () => {
    const rows = parseRecommendedJobsPayload(SAMPLE_PAYLOAD, 1);
    expect(rows.map((row) => `${row.tab}:${row.rank}:${row.title}`)).toEqual([
      'Profile:1:Senior Full Stack Developer',
      'Preferences:1:React Engineer',
    ]);
  });

  it('skips page-wrapper rows when the live page exposes a container as selectable', () => {
    const rows = parseRecommendedJobsPayload({
      ...SAMPLE_PAYLOAD,
      items: [
        ...SAMPLE_PAYLOAD.items,
        {
          tab: 'Top Candidate',
          title: 'Custom Software Engineer',
          company: 'Careernet',
          can_select: true,
          raw_text: 'Recommended jobs for you You can select upto 5 jobs to apply Apply Profile (13) Top Candidate (2) Preferences (36) You might like (75) Custom Software Engineer Careernet Save Hide Senior MongoDB Developer Ascendion Engineering Save Hide',
        },
      ],
    }, 10);
    expect(rows.map((row) => row.title)).not.toContain('Custom Software Engineer');
  });

  it('raises auth required on login pages', () => {
    expect(() => parseRecommendedJobsPayload({
      url: 'https://www.naukri.com/nlogin/login',
      title: 'Login | Naukri',
      text: 'Login Sign in Register',
      items: [],
    })).toThrow(AuthRequiredError);
  });

  it('raises typed error when no job cards are present', () => {
    expect(() => parseRecommendedJobsPayload({
      url: 'https://www.naukri.com/mnjuser/recommendedjobs',
      title: 'Recommended Jobs | Naukri',
      text: 'Recommended Jobs',
      items: [],
    })).toThrow(CommandExecutionError);
  });

  it('drives browser to recommended jobs page and returns parsed rows', async () => {
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      autoScroll: vi.fn(async () => {}),
      evaluate: vi.fn(async () => SAMPLE_PAYLOAD),
    };

    await expect(command.func(page, { tabs: 'all', 'limit-per-tab': 5 })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Senior Full Stack Developer' }),
    ]));
    expect(page.goto).toHaveBeenCalledWith('https://www.naukri.com/mnjuser/recommendedjobs');
    expect(page.autoScroll).toHaveBeenCalled();
  });

  it('rejects out-of-range per-tab limits before opening the browser', async () => {
    const page = {
      goto: vi.fn(async () => {}),
    };
    await expect(command.func(page, { tabs: 'all', 'limit-per-tab': 101 })).rejects.toThrow('limit-per-tab must be an integer between 1 and 100');
    expect(page.goto).not.toHaveBeenCalled();
  });
});
