import { describe, expect, it } from "vitest";
import { canonicalizeUrl, detectPlatform, isJobBoardHost } from "../../src/extraction";
import { isJobBoardName } from "../../src/extraction/canonical";

describe("detectPlatform", () => {
  it.each([
    ["https://www.linkedin.com/jobs/view/3998877665/", "linkedin", "3998877665"],
    ["https://www.linkedin.com/jobs/view/marketing-manager-at-acme-3998877665?trk=x", "linkedin", "3998877665"],
    ["https://www.linkedin.com/jobs/search/?currentJobId=4011223344&keywords=nurse", "linkedin", "4011223344"],
    ["https://in.indeed.com/viewjob?jk=8f3a2b1c9d7e6f50&from=serp", "indeed", "8f3a2b1c9d7e6f50"],
    ["https://www.indeed.co.uk/jobs?q=nurse&vjk=0a1b2c3d4e5f6071", "indeed", "0a1b2c3d4e5f6071"],
    ["https://www.glassdoor.com/job-listing/analyst-acme-JV_IC1.htm?jl=1009123456789", "glassdoor", "1009123456789"],
    ["https://www.glassdoor.co.in/Job/x.htm?jobListingId=1009555", "glassdoor", "1009555"],
    ["https://wellfound.com/jobs/2876543-backend-engineer", "wellfound", "2876543"],
    ["https://internshala.com/job/detail/marketing-executive-job-in-pune-at-acme1712345678", "internshala", "1712345678"],
    ["https://www.dice.com/job-detail/4f1d2c3b-aaaa-bbbb-cccc-0123456789ab", "dice", "4f1d2c3b-aaaa-bbbb-cccc-0123456789ab"],
    ["https://www.ziprecruiter.com/c/Acme/Job/Nurse/-in-Austin,TX?jid=a1b2c3d4e5", "ziprecruiter", "a1b2c3d4e5"],
    ["https://www.monster.com/job-openings/teacher-boston-ma--9a8b7c6d-1111-2222-3333-444455556666", "monster", "9a8b7c6d-1111-2222-3333-444455556666"],
    ["https://boards.greenhouse.io/kestrellabs/jobs/4012345005", "greenhouse", "4012345005"],
    ["https://job-boards.greenhouse.io/kestrellabs/jobs/4012345005?gh_src=x", "greenhouse", "4012345005"],
    ["https://www.kestrel.example/careers/open-roles?gh_jid=4012345005", "greenhouse", "4012345005"],
    ["https://jobs.lever.co/maplegrove/5b1c7a9e-3f2d-4e8a-9c61-0d2b4f8e7a13", "lever", "5b1c7a9e-3f2d-4e8a-9c61-0d2b4f8e7a13"],
    ["https://gulfstar.wd3.myworkdayjobs.com/en-US/Careers/job/Dubai/Financial-Analyst_JR-104233", "workday", "JR-104233"],
    ["https://acme.wd1.myworkdayjobs.com/External/job/Pune/Engineer_R12345?source=x", "workday", "R12345"],
    ["https://jobs.smartrecruiters.com/AcmeGroup/743999912345678-registered-nurse", "smartrecruiters", "743999912345678"],
    ["https://jobs.ashbyhq.com/kestrel/0c2d4e6f-1234-4abc-9def-001122334455", "ashby", "0c2d4e6f-1234-4abc-9def-001122334455"],
    ["https://careers.example-hospital.org/jobs/rn-123", "company_site", null],
  ])("%s → %s", (url, platform, id) => {
    expect(detectPlatform(url)).toEqual({ platform, sourceJobId: id });
  });

  it("treats invalid URLs as company_site without an id", () => {
    expect(detectPlatform("not a url")).toEqual({ platform: "company_site", sourceJobId: null });
    expect(detectPlatform("javascript:alert(1)")).toEqual({ platform: "company_site", sourceJobId: null });
  });
});

describe("canonicalizeUrl", () => {
  it("collapses LinkedIn URLs to the job view URL", () => {
    expect(canonicalizeUrl("https://de.linkedin.com/jobs/view/marketing-manager-at-x-3998877665/?trk=abc&refId=1#top")).toBe(
      "https://www.linkedin.com/jobs/view/3998877665/",
    );
    expect(canonicalizeUrl("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4011223344")).toBe(
      "https://www.linkedin.com/jobs/view/4011223344/",
    );
  });

  it("collapses Indeed URLs to viewjob?jk=", () => {
    expect(canonicalizeUrl("https://IN.Indeed.com/rc/clk?jk=abc123&from=serp&tk=xyz&utm_source=google#apply")).toBe(
      "https://in.indeed.com/viewjob?jk=abc123",
    );
  });

  it("strips tracking params and the fragment but keeps identity params", () => {
    expect(
      canonicalizeUrl("https://Careers.Acme.example/jobs/view?id=55&utm_source=x&utm_campaign=y&gclid=1&fbclid=2&ref=li&trk=a&src=b&gh_jid=99#section"),
    ).toBe("https://careers.acme.example/jobs/view?gh_jid=99&id=55");
    expect(canonicalizeUrl("https://jobs.lever.co/acme/5b1c7a9e-3f2d-4e8a-9c61-0d2b4f8e7a13?lever-source=LinkedIn")).toBe(
      "https://jobs.lever.co/acme/5b1c7a9e-3f2d-4e8a-9c61-0d2b4f8e7a13",
    );
  });

  it("returns null for invalid or non-http URLs", () => {
    expect(canonicalizeUrl("nope")).toBeNull();
    expect(canonicalizeUrl("ftp://example.com/job")).toBeNull();
  });
});

describe("isJobBoardHost / isJobBoardName", () => {
  it.each([
    "www.linkedin.com", "in.indeed.com", "uk.indeed.com", "www.glassdoor.co.uk", "boards.greenhouse.io",
    "jobs.lever.co", "acme.wd3.myworkdayjobs.com", "jobs.smartrecruiters.com", "jobs.ashbyhq.com",
    "www.naukri.com", "www.seek.com.au", "www.stepstone.de", "www.bayt.com", "internshala.com",
  ])("%s is a job board", (host) => {
    expect(isJobBoardHost(host)).toBe(true);
  });

  it.each(["careers.staidans-hospital.example.org", "www.acme.com", "jobs.siemens.com", "careers.infosys.com"])("%s is not a job board", (host) => {
    expect(isJobBoardHost(host)).toBe(false);
  });

  it("recognises job board brand names", () => {
    expect(isJobBoardName("LinkedIn")).toBe(true);
    expect(isJobBoardName("Indeed.com")).toBe(true);
    expect(isJobBoardName("Glassdoor")).toBe(true);
    expect(isJobBoardName("Acme Corp")).toBe(false);
  });
});

import { employerFromSiteName } from "../../src/extraction/meta";

describe("employerFromSiteName", () => {
  it("strips career-site wrappers from og:site_name", () => {
    expect(employerFromSiteName("Careers at Airbnb")).toBe("Airbnb");
    expect(employerFromSiteName("Siemens Careers")).toBe("Siemens");
    expect(employerFromSiteName("Infosys | Jobs")).toBe("Infosys");
    expect(employerFromSiteName("Jobs at St Mary's Hospital")).toBe("St Mary's Hospital");
    expect(employerFromSiteName("Careers")).toBeNull();
    expect(employerFromSiteName("Deloitte")).toBe("Deloitte");
  });
});
