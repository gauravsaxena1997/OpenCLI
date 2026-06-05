import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';
import { JOB_DETAIL_COLUMNS } from './job-detail.js';
import './job-detail.js';

const {
  buildDetailCandidates,
  extractJobId,
  parseDetailResponse,
} = await import('./job-detail.js').then((m) => m.__test__);

describe('naukri job-detail adapter', () => {
  const command = getRegistry().get('naukri/job-detail');

  it('registers command shape', () => {
    expect(command).toBeDefined();
    expect(command.access).toBe('read');
    expect(command.strategy).toBe('cookie');
    expect(command.browser).toBe(true);
    expect(command.navigateBefore).toBe('https://www.naukri.com');
    expect(command.columns).toEqual(JOB_DETAIL_COLUMNS);
    expect(command.args.map((arg) => arg.name)).toEqual(['job-url-or-job-id', 'transport']);
  });

  it('extracts job ids from Naukri urls and raw ids', () => {
    expect(extractJobId('010126000002')).toBe('010126000002');
    expect(extractJobId('https://www.naukri.com/job-listings-backend-engineer-builder-labs-bengaluru-010126000002?src=rec')).toBe('010126000002');
    expect(extractJobId('https://www.naukri.com/jobdetail?jobId=123456789')).toBe('123456789');
  });

  it('builds direct fetch candidates from a job URL', () => {
    const candidates = buildDetailCandidates('https://www.naukri.com/job-listings-backend-engineer-builder-labs-bengaluru-010126000002?src=rec');
    expect(candidates[0]).toBe('https://www.naukri.com/job-listings-backend-engineer-builder-labs-bengaluru-010126000002');
    expect(candidates).toContain('https://www.naukri.com/jobdetail?jobId=010126000002');
    expect(candidates).toContain('https://www.naukri.com/jobapi/v1/job/010126000002');
  });

  it('parses JSON detail payloads', () => {
    const row = parseDetailResponse({
      ok: true,
      status: 200,
      contentType: 'application/json',
      url: 'https://www.naukri.com/jobapi/v1/job/010126000002',
      text: JSON.stringify({
        job: {
          jobId: '010126000002',
          jobTitle: 'Senior Full Stack Developer',
          companyName: 'Acme Software',
          locations: ['Remote', 'India'],
          experienceText: '5-8 Yrs',
          salary: 'Not disclosed',
          jobDescription: '<p>Build React and Node.js products.</p><p>Own CI/CD.</p>',
          keySkills: ['React', 'Node.js', 'TypeScript'],
          postedBy: 'Acme Recruiter',
          companyProfileUrl: '/acme-software-overview',
          aboutCompany: 'Product engineering company.',
          applyUrl: '/job-listings-senior-full-stack-developer-acme-software-remote-010126000002',
        },
      }),
    }, 'https://www.naukri.com/jobapi/v1/job/010126000002', '010126000002');

    expect(row).toMatchObject({
      job_id: '010126000002',
      title: 'Senior Full Stack Developer',
      company: 'Acme Software',
      location: 'Remote, India',
      experience: '5-8 Yrs',
      description: 'Build React and Node.js products. Own CI/CD.',
      skills: 'React, Node.js, TypeScript',
      recruiter_or_posted_by: 'Acme Recruiter',
      company_url: 'https://www.naukri.com/acme-software-overview',
      source_quality: 'session_fetch_json',
    });
    expect(Object.keys(row)).toEqual(JOB_DETAIL_COLUMNS);
  });

  it('parses HTML/embedded JSON detail payloads without clicking read-more UI', () => {
    const row = parseDetailResponse({
      ok: true,
      status: 200,
      contentType: 'text/html',
      url: 'https://www.naukri.com/job-listings-senior-full-stack-developer-acme-software-remote-010126000002',
      text: `
        <html><head>
          <script type="application/ld+json">
            {"@type":"JobPosting","title":"Senior Full Stack Developer","description":"<p>Full description hidden behind read more but present in HTML.</p>","hiringOrganization":{"name":"Acme Software"},"jobLocation":{"name":"Remote"}}
          </script>
        </head><body>
          <h1>Senior Full Stack Developer</h1>
          <section>Key Skills: React Node.js TypeScript</section>
        </body></html>
      `,
    }, 'https://www.naukri.com/job-listings-senior-full-stack-developer-acme-software-remote-010126000002', '');

    expect(row.title).toBe('Senior Full Stack Developer');
    expect(row.company).toBe('Acme Software');
    expect(row.description).toBe('Full description hidden behind read more but present in HTML.');
    expect(row.source_quality).toBe('session_fetch_html');
  });

  it('raises auth required on login responses', () => {
    expect(() => parseDetailResponse({
      ok: true,
      status: 200,
      contentType: 'text/html',
      url: 'https://www.naukri.com/nlogin/login',
      text: '<title>Login</title> Sign in Register',
    }, 'https://www.naukri.com/nlogin/login', '010126000002')).toThrow(AuthRequiredError);
  });

  it('fetches candidates through page.evaluate without goto or click', async () => {
    const page = {
      evaluate: vi.fn(async () => ({
        ok: true,
        status: 200,
        contentType: 'application/json',
        url: 'https://www.naukri.com/jobapi/v1/job/010126000002',
        text: JSON.stringify({
          job: {
            jobId: '010126000002',
            jobTitle: 'Backend Engineer',
            companyName: 'Builder Labs',
            jobDescription: 'Build backend APIs.',
          },
        }),
      })),
      goto: vi.fn(async () => {}),
      click: vi.fn(async () => {}),
    };

    await expect(command.func(page, {
      'job-url-or-job-id': '010126000002',
      transport: 'session-fetch',
    })).resolves.toEqual([
      expect.objectContaining({
        job_id: '010126000002',
        title: 'Backend Engineer',
        company: 'Builder Labs',
        description: 'Build backend APIs.',
      }),
    ]);
    expect(page.evaluate).toHaveBeenCalled();
    expect(page.goto).not.toHaveBeenCalled();
    expect(page.click).not.toHaveBeenCalled();
  });
});
