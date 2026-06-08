import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { AuthRequiredError } from '@jackwener/opencli/errors';
import { JOB_DETAIL_COLUMNS } from './job-detail.js';
import './job-detail.js';

const {
  buildDetailCandidates,
  buildRenderedDetailScript,
  extractJobId,
  normalizeRenderedDetail,
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
    expect(candidates[1]).toBe('https://www.naukri.com/jobapi/v2/job/010126000002');
    expect(candidates[2]).toBe('https://www.naukri.com/jobapi/v1/job/010126000002');
    expect(candidates).toContain('https://www.naukri.com/jobdetail?jobId=010126000002');
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

  it('parses native Naukri jobapi v2 payloads from recommended jobs', () => {
    const row = parseDetailResponse({
      ok: true,
      status: 200,
      contentType: 'application/json',
      url: 'https://www.naukri.com/jobapi/v2/job/040626012864',
      text: JSON.stringify({
        job: {
          jobId: '040626012864',
          post: 'AI/Ml Engineer (Python, React)- Remote',
          companyName: 'Aarizon Services',
          cityfield: 'Remote Anywhere in India',
          minExp: '7',
          maxExp: '12',
          jobDesc: 'Python and JavaScript/TypeScript. Minimum 2+ years of hands-on experience building Generative AI app in production.',
          CANDPROF: 'Strong full-stack development experience across frontend and backend technologies.',
          prefKeywords: ['Generative Ai', 'RAG', 'React.js', 'Python'],
          staticUrl: 'https://www.naukri.com/job-listings-AI-Ml-Engineer-Python-React-Remote-Aarizon-Services-7-to-12-years-040626012864',
        },
      }),
    }, 'https://www.naukri.com/jobapi/v2/job/040626012864', '040626012864');

    expect(row).toMatchObject({
      job_id: '040626012864',
      title: 'AI/Ml Engineer (Python, React)- Remote',
      company: 'Aarizon Services',
      location: 'Remote Anywhere in India',
      experience: '7-12 Yrs',
      description: 'Python and JavaScript/TypeScript. Minimum 2+ years of hands-on experience building Generative AI app in production.',
      skills: 'Generative Ai, RAG, React.js, Python',
      apply_url: 'https://www.naukri.com/job-listings-AI-Ml-Engineer-Python-React-Remote-Aarizon-Services-7-to-12-years-040626012864',
      source_quality: 'session_fetch_json',
    });
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

  it('normalizes rendered fallback detail after read-more expansion', () => {
    const row = normalizeRenderedDetail({
      job_id: '010126000002',
      title: 'Senior Full Stack Developer',
      company: 'Acme Software',
      location: 'Remote',
      experience: '5-8 Yrs',
      salary: 'Not disclosed',
      posted: '1 day ago',
      description: 'Build React and Node.js products after the Read more section is expanded.',
      skills: 'React, Node.js, TypeScript',
      recruiter_or_posted_by: 'Posted by Acme Recruiter',
      company_url: '/acme-software-overview',
      company_profile: 'Product engineering company.',
      apply_url: '/job-listings-senior-full-stack-developer-acme-software-remote-010126000002',
      apply_state: 'Apply',
      raw_text: 'Senior Full Stack Developer Acme Software Build React and Node.js products.',
    }, 'https://www.naukri.com/job-listings-senior-full-stack-developer-acme-software-remote-010126000002', '010126000002');

    expect(row).toMatchObject({
      job_id: '010126000002',
      title: 'Senior Full Stack Developer',
      company: 'Acme Software',
      description: 'Build React and Node.js products after the Read more section is expanded.',
      source_quality: 'rendered_detail_fallback',
    });
    expect(Object.keys(row)).toEqual(JOB_DETAIL_COLUMNS);
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

  it('continues to authenticated API candidates after an auth-walled guessed page', async () => {
    const page = {
      evaluate: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          contentType: 'text/html',
          url: 'https://www.naukri.com/jobdetail?jobId=010126000002',
          text: '<title>Login</title> Sign in Register',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          contentType: 'application/json',
          url: 'https://www.naukri.com/jobapi/v2/job/010126000002',
          text: JSON.stringify({
            job: {
              jobId: '010126000002',
              post: 'Backend Engineer',
              companyName: 'Builder Labs',
              jobDesc: 'Build backend APIs from authenticated API JSON.',
            },
          }),
        }),
      goto: vi.fn(async () => {}),
      click: vi.fn(async () => {}),
    };

    await expect(command.func(page, {
      'job-url-or-job-id': 'https://www.naukri.com/jobdetail?jobId=010126000002',
      transport: 'session-fetch',
    })).resolves.toEqual([
      expect.objectContaining({
        job_id: '010126000002',
        title: 'Backend Engineer',
        company: 'Builder Labs',
        description: 'Build backend APIs from authenticated API JSON.',
      }),
    ]);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('falls back to rendered detail when direct fetch candidates are unusable', async () => {
    const page = {
      evaluate: vi.fn(async (script) => {
        if (String(script).includes('querySelectorAll')) {
          return {
            job_id: '010126000002',
            title: 'Backend Engineer',
            company: 'Builder Labs',
            location: 'Remote',
            description: 'Rendered full JD from the expanded Naukri detail page.',
            skills: 'Node.js, APIs',
            apply_url: 'https://www.naukri.com/job-listings-backend-engineer-builder-labs-remote-010126000002',
            raw_text: 'Backend Engineer Builder Labs Rendered full JD from the expanded Naukri detail page.',
          };
        }
        return {
          ok: true,
          status: 200,
          contentType: 'text/html',
          url: 'https://www.naukri.com/jobdetail?jobId=010126000002',
          text: '<html><body>No usable detail fields</body></html>',
        };
      }),
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
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
        description: 'Rendered full JD from the expanded Naukri detail page.',
        source_quality: 'rendered_detail_fallback',
      }),
    ]);
    expect(page.goto).toHaveBeenCalled();
    expect(page.click).not.toHaveBeenCalled();
    expect(buildRenderedDetailScript()).toContain('read more');
  });
});
