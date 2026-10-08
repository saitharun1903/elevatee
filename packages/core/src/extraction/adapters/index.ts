/**
 * Platform-specific DOM adapters. Each returns only what its selectors find (method "platform_dom").
 */
import type { SourcePlatform } from "../../schemas/job";
import { collapseWhitespace, elementText, inlineText, queryFirst, safeQuery, safeQueryAll, textOf } from "../html";
import { mapEmploymentToken, mapWorkplaceToken } from "../normalize";
import { extractEmploymentType, extractSalaryFromText, extractWorkplaceType } from "../sections";
import { cleanCompanyName, fromSelectors, labelledValue, listsUnderHeadings, result } from "./common";
import type { Adapter, AdapterContext } from "./common";

export type { AdapterContext } from "./common";

const linkedin: Adapter = ({ root }) => {
  const f = fromSelectors(root, {
    title: [
      ".top-card-layout__title",
      "h1.topcard__title",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      ".t-24.job-details-jobs-unified-top-card__job-title",
    ],
    company: [
      ".topcard__org-name-link",
      ".top-card-layout__second-subline .topcard__flavor a",
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name",
    ],
    description: [
      ".show-more-less-html__markup",
      ".description__text .show-more-less-html",
      ".jobs-description__content .jobs-box__html-content",
      ".jobs-description__content",
      "#job-details",
    ],
  });
  // Location: guest "topcard__flavor--bullet"; logged-in "primary description" text "City, Country · 2 weeks ago · …".
  f.location =
    textOf(root, [".topcard__flavor--bullet", ".job-details-jobs-unified-top-card__bullet", ".jobs-unified-top-card__bullet"]) ??
    (textOf(root, [".job-details-jobs-unified-top-card__primary-description-container", ".job-details-jobs-unified-top-card__tertiary-description-container"])
      ?.split("·")[0]
      ?.trim() || null);
  // Job criteria list (guest view): "Employment type" → "Full-time".
  for (const item of safeQueryAll(root, ".description__job-criteria-item")) {
    const label = textOf(item, [".description__job-criteria-subheader", "h3"])?.toLowerCase() ?? "";
    const value = textOf(item, [".description__job-criteria-text", "span"]);
    if (label.includes("employment type")) f.employmentType = mapEmploymentToken(value) ?? f.employmentType ?? null;
  }
  const insightText = safeQueryAll(
    root,
    ".job-details-jobs-unified-top-card__workplace-type, .jobs-unified-top-card__workplace-type, .job-details-preferences-and-skills__pill, .job-details-jobs-unified-top-card__job-insight, .ui-label",
  )
    .map((el) => inlineText(el))
    .join("\n");
  if (insightText) {
    f.workplaceType = mapWorkplaceToken(insightText) ?? null;
    f.employmentType = f.employmentType ?? mapEmploymentToken(insightText.split("\n")) ?? extractEmploymentType(insightText);
  }
  return result(f);
};

const indeed: Adapter = ({ root }) => {
  const f = fromSelectors(root, {
    title: [
      "h1.jobsearch-JobInfoHeader-title",
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      ".jobsearch-JobInfoHeader-title",
      'h2[data-testid="simpler-jobTitle"]',
    ],
    company: [
      '[data-testid="inlineHeader-companyName"] a',
      '[data-testid="inlineHeader-companyName"]',
      "[data-company-name]",
      ".jobsearch-InlineCompanyRating-companyHeader a",
      ".jobsearch-CompanyInfoContainer a",
    ],
    location: [
      '[data-testid="inlineHeader-companyLocation"]',
      '[data-testid="job-location"]',
      '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
      ".jobsearch-JobInfoHeader-subtitle .jobsearch-JobInfoHeader-companyLocation",
    ],
    description: ["#jobDescriptionText", ".jobsearch-jobDescriptionText"],
    salary: ["#salaryInfoAndJobType", '[data-testid="jobsearch-OtherJobDetailsContainer"]'],
  });
  if (f.title) f.title = f.title.replace(/\s*-\s*job post\s*$/i, "").trim() || null;
  return result(f);
};

const greenhouse: Adapter = ({ root, documentTitle }) => {
  const f = fromSelectors(root, {
    title: [".app-title", "h1.section-header", ".job__title h1", ".job-title", "#header h1", "h1"],
    company: [".company-name", ".job__company"],
    location: [".location", ".job__location", "#header .location"],
    description: ["#content", ".job__description", ".job-post-content", "#app_body .content"],
  });
  // "Job Application for <Title> at <Company>" is Greenhouse's own explicit page title.
  const m = documentTitle ? /^Job Application for (.+?) at (.+)$/i.exec(documentTitle) : null;
  if (m) {
    f.title = f.title ?? collapseWhitespace(m[1] ?? "");
    if (!f.company && f.title && collapseWhitespace(m[1] ?? "").toLowerCase() === f.title.toLowerCase()) {
      f.company = cleanCompanyName(m[2] ?? null);
    }
  }
  if (f.location) f.location = f.location.replace(/^location:?\s*/i, "") || null;
  return result(f);
};

const lever: Adapter = ({ root, documentTitle }) => {
  const f = fromSelectors(root, {
    title: [".posting-headline h2", ".posting-header h2", ".posting-headline h1"],
    location: [".posting-categories .location", ".posting-categories .sort-by-time.posting-category", ".posting-category.location"],
    employment: [".posting-categories .commitment", ".posting-category.commitment"],
    workplace: [".posting-categories .workplaceTypes", ".workplaceTypes"],
  });
  if (f.location) f.location = f.location.replace(/\s*\/\s*$/, "") || null;
  // Description: every content section of the posting, in order.
  const sections = safeQueryAll(root, '[data-qa="job-description"], .section-wrapper .section, [data-qa="closing-description"]');
  const texts: string[] = [];
  for (const s of sections) {
    // Skip nested duplicates (a .section inside the description block).
    if (sections.some((other) => other !== s && isAncestor(other, s))) continue;
    if (s.classNames.includes("last-section-apply") || s.classNames.includes("posting-header")) continue;
    if (safeQuery(s, ".postings-btn, .template-btn-submit, .posting-headline")) continue;
    const t = elementText(s);
    if (t) texts.push(t);
  }
  if (texts.length) f.description = texts.join("\n\n");
  const container = queryFirst(root, [".content .section-wrapper", ".content", ".posting-page", "body"]);
  if (container) Object.assign(f, listsUnderHeadings(container));
  // Company: logo alt text, or the page title "<Company> - <Title>".
  const alt = safeQuery(root, ".main-header-logo img")?.getAttribute("alt");
  if (alt && alt.trim()) f.company = cleanCompanyName(alt.replace(/\s+logo$/i, ""));
  if (!f.company && documentTitle && f.title) {
    const suffix = ` - ${f.title}`;
    if (documentTitle.toLowerCase().endsWith(suffix.toLowerCase())) {
      f.company = cleanCompanyName(documentTitle.slice(0, documentTitle.length - suffix.length));
    }
  }
  return result(f);
};

function isAncestor(a: AdapterContext["root"], b: AdapterContext["root"]): boolean {
  for (let p = b.parentNode; p; p = p.parentNode) if (p === a) return true;
  return false;
}

const workday: Adapter = ({ root }) => {
  const f = fromSelectors(root, {
    title: ['[data-automation-id="jobPostingHeader"]', "h2[data-automation-id='jobPostingHeader']"],
    description: ['[data-automation-id="jobPostingDescription"]'],
  });
  f.location = labelledValue(root, ['[data-automation-id="locations"]'], /^\s*locations?\s*:?\s*/i);
  const time = labelledValue(root, ['[data-automation-id="time"]'], /^\s*time type\s*:?\s*/i);
  f.employmentType = mapEmploymentToken(time) ?? extractEmploymentType(time);
  const remote = labelledValue(root, ['[data-automation-id="remoteType"]'], /^\s*remote type\s*:?\s*/i);
  f.workplaceType = mapWorkplaceToken(remote);
  f.sourceJobId = labelledValue(
    root,
    ['[data-automation-id="requisitionId"]', '[data-automation-id="jobPostingJobId"]'],
    /^\s*(?:job )?(?:requisition )?id\s*:?\s*/i,
  );
  return result(f);
};

const smartrecruiters: Adapter = ({ root }) =>
  result(
    fromSelectors(root, {
      title: ["h1.job-title", '[itemprop="title"]', "h1"],
      company: ['[itemprop="hiringOrganization"] [itemprop="name"]', ".company-name"],
      location: [".job-location", "spl-job-location", '[itemprop="jobLocation"]', ".job-details .location"],
      description: [".job-sections", '[itemprop="description"]', ".job-section", "main"],
      employment: ['[itemprop="employmentType"]'],
    }),
  );

const ashby: Adapter = ({ root }) =>
  result(
    fromSelectors(root, {
      title: ["h1.ashby-job-posting-heading", '[class*="ashby-job-posting-heading"]', "h1"],
      description: ['[class*="descriptionText"]', ".ashby-job-posting-right-pane", '[class*="_description_"]'],
    }),
  );

const glassdoor: Adapter = ({ root }) => {
  const f = fromSelectors(root, {
    title: ['[data-test="job-title"]', '[class*="JobDetails_jobTitle"]', '[data-test="jobTitle"]'],
    company: ['[data-test="employer-name"]', '[class*="EmployerProfile_employerName"]', '[data-test="employerName"]'],
    location: ['[data-test="location"]', '[class*="JobDetails_location"]'],
    description: ['[class*="JobDetails_jobDescription"]', "#JobDescriptionContainer", ".jobDescriptionContent", '[data-test="jobDescriptionContent"]'],
  });
  // Glassdoor shows its own estimates; only employer-provided pay is part of the posting.
  const pay = textOf(root, ['[data-test="detailSalary"]', '[class*="SalaryEstimate_salaryRange"]']);
  const payContext = textOf(root, ['[data-test="detailSalary"]', '[class*="SalaryEstimate"]', '[class*="salary"]']) ?? "";
  if (pay && /employer (?:est|provided)/i.test(payContext)) f.salary = extractSalaryFromText(pay);
  return result(f);
};

const wellfound: Adapter = ({ root }) =>
  result(
    fromSelectors(root, {
      title: ["h1"],
      company: ['a[href*="/company/"] h2', 'a[href*="/company/"]'],
      description: ['[class*="description"]', "#job-description"],
    }),
  );

const internshala: Adapter = ({ root }) =>
  result(
    fromSelectors(root, {
      title: [".heading_4_5.profile", ".profile_on_detail_page", ".profile", "h1"],
      company: [".company_name a", ".company-name", ".company_and_premium a", ".heading_6.company_name"],
      location: ["#location_names a", "#location_names", ".location_link"],
      description: [".internship_details .text-container", ".about_job .text-container", ".internship_details"],
      salary: [".salary .item_body", ".stipend", ".salary_container"],
    }),
  );

const dice: Adapter = ({ root }) =>
  result(
    fromSelectors(root, {
      title: ['h1[data-cy="jobTitle"]', '[data-testid="job-detail-header-card"] h1', "h1"],
      company: ['[data-cy="companyNameLink"]', '[data-wa-click="djv-job-company-profile-click"]', '[data-cy="companyName"]'],
      location: ['[data-cy="location"]', 'li[data-cy="location"]', '[data-testid="job-detail-header-card"] [class*="location"]'],
      description: ['[data-testid="jobDescriptionHtml"]', "#jobDescription", '[data-cy="jobDescription"]'],
      employment: ['[data-cy="employmentDetails"]', '[data-testid="employmentType"]'],
    }),
  );

const ziprecruiter: Adapter = ({ root }) =>
  result(
    fromSelectors(root, {
      title: ["h1.job_title", 'h1[class*="job_title"]', ".job_header h1", "h1"],
      company: [".hiring_company_text a", ".hiring_company a", '[class*="hiring_company"]'],
      location: [".hiring_location", '[class*="location_text"]', ".job_location"],
      description: [".job_description", ".jobDescriptionSection", '[class*="job_description"]'],
      salary: ['[class*="salary"]', ".job_characteristics"],
    }),
  );

const monster: Adapter = ({ root }) =>
  result(
    fromSelectors(root, {
      title: ['[data-testid="jobTitle"]', "h1.job_title", "h1"],
      company: ['[data-testid="company"]', '[data-testid="svx_jobview-company"]'],
      location: ['[data-testid="jobDetailLocation"]', '[data-testid="svx_jobview-location"]'],
      description: ['[data-testid="svx-description-container-inner"]', ".job-description", "#JobDescription"],
    }),
  );

const ADAPTERS: Partial<Record<SourcePlatform, Adapter>> = {
  linkedin,
  indeed,
  greenhouse,
  lever,
  workday,
  smartrecruiters,
  ashby,
  glassdoor,
  wellfound,
  internshala,
  dice,
  ziprecruiter,
  monster,
};

/** Run the adapter for a platform. Never throws. */
export function runAdapter(platform: SourcePlatform, ctx: AdapterContext) {
  const adapter = ADAPTERS[platform];
  if (!adapter) return null;
  try {
    const r = adapter(ctx);
    if (r && r.fields.description) {
      // Workplace stated inside the location ("Berlin (Hybrid)") is explicit data.
      r.fields.workplaceType = r.fields.workplaceType ?? extractWorkplaceType(r.fields.location ?? null);
    }
    return r;
  } catch {
    return null;
  }
}

