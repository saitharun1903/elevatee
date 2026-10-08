/**
 * Hand-written page fixtures modelled on real job board / ATS markup.
 * Companies and people are fictional.
 */

// ---------------------------------------------------------------------------
// LinkedIn guest view (no JSON-LD). Marketing Manager, Berlin, EUR, hybrid.
// ---------------------------------------------------------------------------
export const LINKEDIN_URL =
  "https://www.linkedin.com/jobs/view/marketing-manager-at-nordlicht-foods-3998877665/?trk=public_jobs_topcard-title&refId=abc%3D%3D&trackingId=xyz";

export const linkedinGuestHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Nordlicht Foods GmbH hiring Marketing Manager in Berlin, Germany | LinkedIn</title>
  <meta property="og:site_name" content="LinkedIn">
  <meta property="og:title" content="Nordlicht Foods GmbH hiring Marketing Manager in Berlin, Germany | LinkedIn">
  <meta name="description" content="Posted 3:12:45 PM. About us Nordlicht Foods is a family-owned…">
</head>
<body>
  <header class="global-nav"><a href="/">LinkedIn</a><nav>Jobs People Learning</nav></header>
  <main class="main">
    <section class="top-card-layout">
      <div class="top-card-layout__entity-info">
        <h1 class="top-card-layout__title topcard__title">Marketing Manager</h1>
        <h4 class="top-card-layout__second-subline">
          <div class="topcard__flavor-row">
            <span class="topcard__flavor">
              <a class="topcard__org-name-link topcard__flavor--black-link" href="https://de.linkedin.com/company/nordlicht-foods?trk=public_jobs_topcard-org-name">
                Nordlicht Foods GmbH
              </a>
            </span>
            <span class="topcard__flavor topcard__flavor--bullet">Berlin, Berlin, Germany</span>
          </div>
          <div class="topcard__flavor-row">
            <span class="posted-time-ago__text">2 weeks ago</span>
            <span class="num-applicants__caption">Over 200 applicants</span>
          </div>
        </h4>
        <button class="apply-button">Apply</button>
      </div>
    </section>
    <section class="description">
      <div class="description__text description__text--rich">
        <section class="show-more-less-html">
          <div class="show-more-less-html__markup">
            <strong>About us</strong><br>
            Nordlicht Foods is a family-owned producer of plant-based foods, selling in 14 European markets. Founded 30 years ago in Hamburg, we have grown to 900 people.<br><br>
            <strong>Your role</strong>
            <ul>
              <li>Own the marketing plan for our chilled range in the DACH region</li>
              <li>Lead a team of four marketing specialists and two agencies</li>
              <li>Manage a yearly budget and report on campaign performance</li>
            </ul>
            <strong>What you'll bring</strong>
            <ul>
              <li>5+ years of experience in FMCG brand or product marketing</li>
              <li>Bachelor's degree in Marketing, Business Administration or a related field</li>
              <li>Fluent German and English</li>
            </ul>
            <strong>Nice to have</strong>
            <ul>
              <li>Experience launching products with German grocery retailers</li>
            </ul>
            <strong>What we offer</strong>
            <ul>
              <li>Salary: €65.000 – €75.000 per year</li>
              <li>30 days of holiday</li>
              <li>Hybrid working: 3 days a week in our Berlin office</li>
            </ul>
          </div>
          <button class="show-more-less-html__button">Show more</button>
        </section>
      </div>
      <ul class="description__job-criteria-list">
        <li class="description__job-criteria-item">
          <h3 class="description__job-criteria-subheader">Seniority level</h3>
          <span class="description__job-criteria-text description__job-criteria-text--criteria">Mid-Senior level</span>
        </li>
        <li class="description__job-criteria-item">
          <h3 class="description__job-criteria-subheader">Employment type</h3>
          <span class="description__job-criteria-text description__job-criteria-text--criteria">Full-time</span>
        </li>
      </ul>
    </section>
  </main>
  <footer>LinkedIn Corporation © 2026</footer>
</body>
</html>`;

/** Logged-in style LinkedIn markup where the company element is missing. */
export const linkedinNoCompanyHtml = `<!DOCTYPE html>
<html><head>
  <title>Staff Nurse | LinkedIn</title>
  <meta property="og:site_name" content="LinkedIn">
</head><body>
  <div class="jobs-search__job-details">
    <h1 class="t-24 job-details-jobs-unified-top-card__job-title">Staff Nurse</h1>
    <div class="job-details-jobs-unified-top-card__primary-description-container">Leeds, England, United Kingdom · 1 week ago · 48 applicants</div>
    <div id="job-details">
      <p>We are recruiting a Staff Nurse for our surgical ward. You will deliver high quality patient care as part of a friendly multidisciplinary team, supporting patients before and after surgery.</p>
      <p>Requirements</p>
      <ul><li>Current NMC registration is essential</li><li>Excellent communication skills</li></ul>
    </div>
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// Indeed (DOM + JSON-LD). Mechanical Engineer, Pune, INR.
// ---------------------------------------------------------------------------
export const INDEED_URL =
  "https://in.indeed.com/viewjob?jk=8f3a2b1c9d7e6f50&from=serp&tk=1h2j3k4l5&utm_source=google&utm_medium=organic#apply";

export const indeedHtml = `<!DOCTYPE html>
<html lang="en-IN"><head>
  <title>Mechanical Design Engineer - Pune, Maharashtra - Indeed.com</title>
  <meta property="og:site_name" content="Indeed">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": "Mechanical Design Engineer",
    "datePosted": "2026-09-28",
    "validThrough": "2026-11-27T23:59:59+05:30",
    "employmentType": "FULL_TIME",
    "hiringOrganization": { "@type": "Organization", "name": "Sahyadri Auto Components Pvt. Ltd.", "sameAs": "https://www.sahyadri-auto.example.in" },
    "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": "Pune", "addressRegion": "Maharashtra", "addressCountry": "IN" } },
    "baseSalary": { "@type": "MonetaryAmount", "currency": "INR", "value": { "@type": "QuantitativeValue", "minValue": 600000, "maxValue": 900000, "unitText": "YEAR" } },
    "description": "&lt;p&gt;Sahyadri Auto Components designs precision castings for two-wheeler OEMs.&lt;/p&gt;&lt;p&gt;&lt;b&gt;Key Responsibilities&lt;/b&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Design fixtures and tooling in SolidWorks and CATIA&lt;/li&gt;&lt;li&gt;Prepare GD&amp;amp;T drawings and BOMs&lt;/li&gt;&lt;li&gt;Coordinate with suppliers on first-article inspection&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;&lt;b&gt;Requirements&lt;/b&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;B.E./B.Tech in Mechanical Engineering&lt;/li&gt;&lt;li&gt;3-5 years of experience in automotive component design&lt;/li&gt;&lt;li&gt;Working knowledge of PPAP and APQP&lt;/li&gt;&lt;/ul&gt;"
  }
  </script>
</head><body>
  <div class="jobsearch-ViewJobLayout">
    <div class="jobsearch-JobInfoHeader-title-container">
      <h1 class="jobsearch-JobInfoHeader-title" data-testid="jobsearch-JobInfoHeader-title"><span>Mechanical Design Engineer</span><span class="visually-hidden"> - job post</span></h1>
    </div>
    <div data-testid="inlineHeader-companyName"><span><a href="https://in.indeed.com/cmp/Sahyadri-Auto">Sahyadri Auto Components Pvt. Ltd.</a></span></div>
    <div data-testid="inlineHeader-companyLocation"><div>Pune, Maharashtra</div></div>
    <div id="salaryInfoAndJobType"><span>₹6,00,000 - ₹9,00,000 a year</span><span> - Full-time</span></div>
    <div id="jobDescriptionText" class="jobsearch-jobDescriptionText">
      <p>Sahyadri Auto Components designs precision castings for two-wheeler OEMs.</p>
      <p><b>Key Responsibilities</b></p>
      <ul><li>Design fixtures and tooling in SolidWorks and CATIA</li><li>Prepare GD&amp;T drawings and BOMs</li><li>Coordinate with suppliers on first-article inspection</li></ul>
      <p><b>Requirements</b></p>
      <ul><li>B.E./B.Tech in Mechanical Engineering</li><li>3-5 years of experience in automotive component design</li><li>Working knowledge of PPAP and APQP</li></ul>
    </div>
  </div>
</body></html>`;

/** Indeed DOM where the employer element is absent — the platform is NOT the employer. */
export const indeedNoCompanyHtml = `<!DOCTYPE html>
<html><head>
  <title>Warehouse Associate - Indeed.com</title>
  <meta property="og:site_name" content="Indeed">
  <meta property="og:title" content="Warehouse Associate">
</head><body>
  <h1 class="jobsearch-JobInfoHeader-title">Warehouse Associate</h1>
  <div data-testid="job-location">Calgary, AB</div>
  <div id="salaryInfoAndJobType"><span>$19 - $22 an hour</span> - <span>Part-time</span></div>
  <div id="jobDescriptionText">
    <p>Pick, pack and ship customer orders accurately. Operate pallet jacks safely. Help keep the warehouse clean and organised.</p>
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// Greenhouse hosted board. Software Engineer, remote.
// ---------------------------------------------------------------------------
export const GREENHOUSE_URL = "https://boards.greenhouse.io/kestrellabs/jobs/4012345005?gh_src=abc123&utm_source=linkedin";

export const greenhouseHtml = `<!DOCTYPE html>
<html><head>
  <title>Job Application for Senior Software Engineer, Platform at Kestrel Labs</title>
  <meta property="og:title" content="Senior Software Engineer, Platform">
</head><body>
  <div id="wrapper">
    <div id="main">
      <div id="app_body">
        <div id="header">
          <h1 class="app-title">Senior Software Engineer, Platform</h1>
          <span class="company-name">at Kestrel Labs</span>
          <div class="location">Remote</div>
        </div>
        <div id="content">
          <p>Kestrel Labs builds observability tooling used by 3,000 engineering teams.</p>
          <p><strong>What you'll do</strong></p>
          <ul>
            <li>Design and operate our multi-region ingestion pipeline</li>
            <li>Improve reliability of services written in Go and Rust</li>
            <li>Mentor engineers through design reviews</li>
          </ul>
          <p><strong>What we're looking for</strong></p>
          <ul>
            <li>6+ years of experience building distributed systems</li>
            <li>Production experience with Kubernetes</li>
          </ul>
          <p><strong>Bonus points</strong></p>
          <ul><li>Contributions to open-source observability projects</li></ul>
          <p>This is a fully remote role open to candidates in any time zone between UTC-5 and UTC+2.</p>
          <p>The base salary range for this role is $140,000 — $170,000 USD per year.</p>
        </div>
        <form id="application_form"><label>First Name</label><input name="first_name"></form>
      </div>
    </div>
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// Lever. Secondary School Teacher, Toronto, CAD.
// ---------------------------------------------------------------------------
export const LEVER_URL = "https://jobs.lever.co/maplegrove-academy/5b1c7a9e-3f2d-4e8a-9c61-0d2b4f8e7a13?lever-source=Indeed&lever-origin=applied";

export const leverHtml = `<!DOCTYPE html>
<html><head>
  <title>Maple Grove Academy - Secondary School Mathematics Teacher</title>
  <meta property="og:site_name" content="Maple Grove Academy">
</head><body>
  <div class="main-header page-full-width section-wrapper">
    <div class="main-header-content page-centered narrow-section">
      <a class="main-header-logo" href="https://jobs.lever.co/maplegrove-academy"><img alt="Maple Grove Academy logo" src="https://lever-client-logos.s3.amazonaws.com/mga.png"></a>
    </div>
  </div>
  <div class="content-wrapper posting-page">
    <div class="content">
      <div class="section-wrapper accent-section page-full-width">
        <div class="section page-centered posting-header">
          <div class="posting-headline">
            <h2>Secondary School Mathematics Teacher</h2>
            <div class="posting-categories">
              <div class="sort-by-time posting-category medium-category-label width-full capitalize-labels location">Toronto, Ontario</div>
              <div class="sort-by-team posting-category medium-category-label capitalize-labels department">Academics – Upper School /</div>
              <div class="sort-by-commitment posting-category medium-category-label capitalize-labels commitment">Full-time</div>
              <div class="posting-category medium-category-label capitalize-labels workplaceTypes">On-site</div>
            </div>
          </div>
        </div>
      </div>
      <div class="section-wrapper page-full-width">
        <div class="section page-centered" data-qa="job-description">
          <div>Maple Grove Academy is an independent school for students in grades 7–12. We are looking for a mathematics teacher to join our Upper School from January 2027.</div>
        </div>
        <div class="section page-centered">
          <h3>What you'll do</h3>
          <ul class="posting-requirements plain-list">
            <li>Teach Grade 9–12 mathematics, including MHF4U and MCV4U</li>
            <li>Prepare students for university entrance and math contests</li>
            <li>Communicate progress to students and families</li>
          </ul>
        </div>
        <div class="section page-centered">
          <h3>What you'll bring</h3>
          <ul class="posting-requirements plain-list">
            <li>Bachelor of Education (B.Ed.) and Ontario College of Teachers (OCT) certification required</li>
            <li>At least two years of experience teaching secondary mathematics</li>
          </ul>
        </div>
        <div class="section page-centered">
          <h3>Nice to have</h3>
          <ul class="posting-requirements plain-list"><li>Experience coaching a robotics or math club</li></ul>
        </div>
        <div class="section page-centered" data-qa="closing-description">
          <div>Salary: CA$68,000 – CA$92,000 per year, based on the Academy's salary grid.</div>
        </div>
        <div class="section page-centered last-section-apply">
          <a class="postings-btn template-btn-submit" href="https://jobs.lever.co/maplegrove-academy/5b1c7a9e-3f2d-4e8a-9c61-0d2b4f8e7a13/apply">Apply for this job</a>
        </div>
      </div>
    </div>
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// Workday (DOM + JSON-LD). Financial Analyst, Dubai, AED.
// ---------------------------------------------------------------------------
export const WORKDAY_URL =
  "https://gulfstar.wd3.myworkdayjobs.com/en-US/Careers/job/Dubai---DIFC/Financial-Analyst_JR-104233?source=LinkedIn";

export const workdayHtml = `<!DOCTYPE html>
<html><head>
  <title>Financial Analyst</title>
  <script type="application/ld+json">{
    "@context": "http://schema.org",
    "@type": "JobPosting",
    "title": "Financial Analyst",
    "description": "<p><b>Job Summary</b></p><p>Gulfstar Holdings is seeking a Financial Analyst for its Dubai head office.</p><p><b>Key Duties</b></p><ul><li>Build monthly management reports for the board</li><li>Own the annual budgeting and forecasting cycle</li></ul><p><b>Qualifications</b></p><ul><li>Bachelor's degree in Finance or Accounting</li><li>Minimum of 4 years of experience in FP&amp;A</li><li>CFA or ACCA progress preferred</li></ul><p>Package: AED 18,000 - 22,000 per month plus annual bonus.</p>",
    "identifier": { "@type": "PropertyValue", "name": "Gulfstar Holdings", "value": "JR-104233" },
    "datePosted": "2026-09-30",
    "employmentType": "Full time",
    "hiringOrganization": { "@type": "Organization", "name": "Gulfstar Holdings" },
    "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": "Dubai", "addressCountry": "United Arab Emirates" } }
  }</script>
</head><body>
  <div data-automation-id="jobPostingPage">
    <h2 data-automation-id="jobPostingHeader">Financial Analyst</h2>
    <div data-automation-id="locations"><dl><dt>locations</dt><dd>Dubai - DIFC</dd></dl></div>
    <div data-automation-id="remoteType"><dl><dt>remote type</dt><dd>Hybrid</dd></dl></div>
    <div data-automation-id="time"><dl><dt>time type</dt><dd>Full time</dd></dl></div>
    <div data-automation-id="postedOn"><dl><dt>posted on</dt><dd>Posted 7 Days Ago</dd></dl></div>
    <div data-automation-id="requisitionId"><dl><dt>job requisition id</dt><dd>JR-104233</dd></dl></div>
    <div data-automation-id="jobPostingDescription">
      <p><b>Job Summary</b></p><p>Gulfstar Holdings is seeking a Financial Analyst for its Dubai head office.</p>
      <p><b>Key Duties</b></p><ul><li>Build monthly management reports for the board</li><li>Own the annual budgeting and forecasting cycle</li></ul>
      <p><b>Qualifications</b></p><ul><li>Bachelor's degree in Finance or Accounting</li><li>Minimum of 4 years of experience in FP&amp;A</li><li>CFA or ACCA progress preferred</li></ul>
      <p>Package: AED 18,000 - 22,000 per month plus annual bonus.</p>
    </div>
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// Company career page with JSON-LD inside @graph. Registered Nurse, Manchester, GBP.
// ---------------------------------------------------------------------------
export const HOSPITAL_URL = "https://careers.staidans-hospital.example.org/vacancies/rn-ward-7?utm_campaign=autumn&utm_source=newsletter&fbclid=IwAR0abc";

export const hospitalGraphHtml = `<!DOCTYPE html>
<html lang="en-GB"><head>
  <title>Registered Nurse – Ward 7 (Acute Medicine) | St Aidan's Hospital Careers</title>
  <meta property="og:site_name" content="St Aidan's Hospital Careers">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": "https://careers.staidans-hospital.example.org/#website", "name": "St Aidan's Hospital Careers" },
      { "@type": ["Organization", "Hospital"], "@id": "#org", "name": "St Aidan's Hospital" },
      {
        "@type": "JobPosting",
        "title": "Registered Nurse – Ward 7 (Acute Medicine)",
        "hiringOrganization": { "@type": "Organization", "name": "St Aidan's Hospital", "sameAs": "https://www.staidans-hospital.example.org" },
        "jobLocation": [{ "@type": "Place", "address": { "@type": "PostalAddress", "streetAddress": "1 Oxford Road", "addressLocality": "Manchester", "addressRegion": "Greater Manchester", "postalCode": "M13 9WL", "addressCountry": "United Kingdom" } }],
        "employmentType": ["FULL_TIME"],
        "datePosted": "2026-09-20",
        "validThrough": "2026-10-20T23:59:00+01:00",
        "baseSalary": { "@type": "MonetaryAmount", "currency": "GBP", "value": { "@type": "QuantitativeValue", "minValue": "35392", "maxValue": "42618", "unitText": "YEAR" } },
        "experienceRequirements": { "@type": "OccupationalExperienceRequirements", "monthsOfExperience": 12 },
        "educationRequirements": { "@type": "EducationalOccupationalCredential", "credentialCategory": "bachelor degree" },
        "identifier": { "@type": "PropertyValue", "name": "St Aidan's Hospital", "value": "SAH-RN-2026-117" },
        "jobBenefits": "<ul><li>27 days annual leave plus bank holidays</li><li>NHS Pension Scheme</li><li>Cycle to work scheme</li></ul>",
        "description": "&lt;p&gt;Ward 7 is a 28-bed acute medical ward caring for adults with complex conditions.&lt;/p&gt;&lt;h3&gt;Main duties of the job&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Assess, plan and evaluate care for a group of patients&lt;/li&gt;&lt;li&gt;Administer medicines safely and accurately&lt;/li&gt;&lt;li&gt;Supervise healthcare assistants and nursing students&lt;/li&gt;&lt;/ul&gt;&lt;h3&gt;Essential criteria&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Current NMC registration as a Registered Nurse (Adult)&lt;/li&gt;&lt;li&gt;At least 12 months of post-registration experience in acute care&lt;/li&gt;&lt;/ul&gt;&lt;h3&gt;Desirable criteria&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Mentorship or practice assessor qualification&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;This is an on-site role. Shifts include days, nights and weekends.&lt;/p&gt;"
      }
    ]
  }
  </script>
</head><body>
  <header><nav><a href="/">Home</a> <a href="/vacancies">Vacancies</a></nav></header>
  <main>
    <h1>Registered Nurse – Ward 7 (Acute Medicine)</h1>
    <p>Ward 7 is a 28-bed acute medical ward caring for adults with complex conditions.</p>
  </main>
  <footer>© St Aidan's Hospital</footer>
</body></html>`;

// ---------------------------------------------------------------------------
// Invalid JSON-LD → falls back to semantic DOM. Assistant Accountant, Singapore.
// ---------------------------------------------------------------------------
export const BROKEN_JSONLD_URL = "https://www.lioncitylogistics.example.sg/careers/assistant-accountant";

export const brokenJsonLdHtml = `<!DOCTYPE html>
<html><head>
  <title>Careers | Lion City Logistics</title>
  <script type="application/ld+json">
    { "@context": "https://schema.org", "@type": "JobPosting", "title": "Assistant Accountant", "description": "<p>Unterminated
  </script>
</head><body>
  <nav class="site-nav"><a href="/">Home</a><a href="/about">About</a></nav>
  <main>
    <article class="job-posting">
      <h1>Assistant Accountant</h1>
      <p>Company: Lion City Logistics Pte Ltd</p>
      <p>Location: Jurong East, Singapore</p>
      <div class="job-description">
        <p>We are a regional freight forwarder looking for an Assistant Accountant to support our finance team with month-end closing and audits.</p>
        <h3>Responsibilities</h3>
        <ul>
          <li>Prepare full set of accounts for two subsidiaries</li>
          <li>Handle GST filings and bank reconciliations</li>
          <li>Support the annual statutory audit</li>
        </ul>
        <h3>Requirements</h3>
        <ul>
          <li>Diploma or Degree in Accountancy</li>
          <li>Minimum 2 years of relevant accounting experience</li>
        </ul>
        <p>Salary: S$3,800 - S$4,500 per month</p>
      </div>
    </article>
  </main>
</body></html>`;

/** JSON-LD that is invalid as written but recoverable (trailing commas, raw newline in a string). */
export const recoverableJsonLdHtml = `<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Pharmacist",
  "description": "Dispense prescriptions accurately.
Counsel patients on their medicines.",
  "hiringOrganization": { "@type": "Organization", "name": "Farmacia Alameda", },
  "jobLocation": { "@type": "Place", "address": { "addressLocality": "Santiago", "addressCountry": "Chile", }, },
}
</script>
</head><body><h1>Pharmacist</h1></body></html>`;

// ---------------------------------------------------------------------------
// Missing fields: JSON-LD with only title and description, company site without site name.
// ---------------------------------------------------------------------------
export const MINIMAL_URL = "https://jobs.example-careers.com/posting/77812";

export const minimalHtml = `<!DOCTYPE html>
<html><head>
  <title>Data Entry Clerk</title>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Data Entry Clerk","description":"Enter customer orders into our system and check them for accuracy. Answer simple email queries from customers. Keep spreadsheets up to date."}</script>
</head><body><h1>Data Entry Clerk</h1><p>Enter customer orders into our system and check them for accuracy.</p></body></html>`;

// ---------------------------------------------------------------------------
// Unusual layout: definition list with labelled fields. Electrician, Johannesburg, ZAR.
// ---------------------------------------------------------------------------
export const DL_URL = "https://www.ubuntu-power.example.co.za/vacancies/electrician-jhb";

export const definitionListHtml = `<!DOCTYPE html>
<html><head><title>Vacancy: Qualified Electrician</title></head>
<body>
  <div class="vacancy">
    <h2>Vacancy details</h2>
    <dl class="vacancy-meta">
      <dt>Job title</dt><dd>Qualified Electrician</dd>
      <dt>Employer</dt><dd>Ubuntu Power Services (Pty) Ltd</dd>
      <dt>Location</dt><dd>Johannesburg, Gauteng, South Africa</dd>
      <dt>Salary</dt><dd>ZAR 22 000 – 28 000 per month</dd>
      <dt>Job type</dt><dd>Contract</dd>
      <dt>Reference</dt><dd>UPS-ELEC-0419</dd>
    </dl>
    <div class="vacancy-body">
      <p>Ubuntu Power Services maintains electrical installations for commercial buildings across Gauteng. We need a qualified electrician for a 12-month contract on a new shopping centre project.</p>
      <p><b>Duties:</b></p>
      <ul>
        <li>Install and test low-voltage distribution boards</li>
        <li>Issue Certificates of Compliance (CoC)</li>
      </ul>
      <p><b>Requirements:</b></p>
      <ul>
        <li>Trade test certificate (Red Seal) and wireman's licence</li>
        <li>3 years of post-trade experience</li>
        <li>Valid driver's licence</li>
      </ul>
    </div>
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// Not a job: a blog article.
// ---------------------------------------------------------------------------
export const BLOG_URL = "https://blog.example.com/2026/09/how-we-moved-to-four-day-weeks";

export const blogHtml = `<!DOCTYPE html>
<html><head>
  <title>How we moved to a four-day week | Example Blog</title>
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Example Blog">
</head><body>
  <article>
    <h1>How we moved to a four-day week</h1>
    <p>Last year our team of 40 tried a four-day week for six months. Here is what we learned about focus, meetings and customer support coverage.</p>
    <h2>Why we tried it</h2>
    <p>Burnout was rising and our engagement survey showed people wanted more time for family.</p>
    <h2>What changed</h2>
    <p>We cut recurring meetings by half and moved status updates to writing.</p>
  </article>
</body></html>`;
