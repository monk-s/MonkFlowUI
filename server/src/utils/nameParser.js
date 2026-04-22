/**
 * Name parsing and company cleaning utilities for outreach emails.
 * Extracts real first names from email addresses and cleans page-title cruft from company names.
 */

// Common first names dictionary for splitting concatenated email local parts
const COMMON_NAMES = new Set([
  'aaron','adam','adrian','alan','albert','alex','alexander','alfred','alice','alicia','alison','allen',
  'allison','amanda','amber','amy','andrea','andrew','andy','angela','angel','ann','anna','anne',
  'anthony','antonio','april','arthur','ashley','audrey','austin','barbara','barry','becky','ben',
  'benjamin','beth','betty','beverly','bill','billy','blake','bob','bobby','bonnie','brad','bradley',
  'brandon','brenda','brent','brett','brian','brianna','brittany','brooke','bruce','bryan','caleb',
  'calvin','cameron','carl','carla','carol','caroline','carolyn','casey','catherine','chad','charles',
  'charlie','charlotte','chase','chelsea','cheryl','chris','christian','christina','christine',
  'christopher','cindy','claire','clarence','clark','claude','corey','courtney','craig','crystal',
  'curt','curtis','cynthia','dale','dan','dana','daniel','danny','darla','darlene','darren','dave',
  'david','dawn','dean','debbie','deborah','debra','dennis','derek','derrick','diana','diane','don',
  'donald','donna','doris','dorothy','doug','douglas','drew','dustin','dylan','earl','ed','eddie',
  'edward','eileen','elaine','elizabeth','ellen','emily','emma','eric','erica','erik','erin','ernest',
  'ethan','eugene','evan','evelyn','faith','frank','fred','gabriel','gail','gary','gene','george',
  'gerald','gina','glen','glenn','gloria','grace','greg','gregory','gwen','hailey','hannah','harold',
  'harry','heather','helen','henry','holly','howard','hunter','irene','jack','jackie','jacob','james',
  'jamie','jan','jane','janet','janice','jared','jason','jay','jean','jeff','jeffrey','jen','jenna',
  'jennifer','jenny','jeremy','jerry','jesse','jessica','jill','jim','jimmy','joan','joann','joanna',
  'joe','joel','john','johnny','jon','jonathan','jordan','jose','joseph','josh','joshua','joy','joyce',
  'juan','judith','judy','julia','julian','julie','justin','kara','karen','karl','kate','katherine',
  'kathleen','kathy','katie','kayla','keith','kelly','ken','kendra','kenneth','kenny','kevin','kim',
  'kimberly','kristen','kristin','kristina','kurt','kyle','lance','larry','laura','lauren','laurie',
  'lawrence','leah','lee','leon','leonard','leslie','liam','lillian','lily','linda','lindsay','lisa',
  'logan','lois','lonnie','lori','louis','louise','lucas','luke','lynn','madison','marc','marcus',
  'margaret','maria','marie','marilyn','mario','mark','marlene','marsha','martha','martin','mary',
  'mason','matt','matthew','maureen','max','megan','melanie','melissa','michael','michele','michelle',
  'mike','miles','miranda','mitchell','molly','monica','morgan','nancy','natalie','nathan','neal',
  'neil','nicholas','nick','nicole','noah','noel','norma','norman','olivia','oscar','pam','pamela',
  'pat','patricia','patrick','patty','paul','paula','peggy','penny','perry','pete','peter','phil',
  'philip','phyllis','rachel','ralph','randy','ray','raymond','rebecca','regina','renee','rex',
  'rhonda','richard','rick','ricky','rita','rob','robert','robin','rod','rodney','roger','ron',
  'ronald','ronnie','rosa','rose','ross','roxanne','roy','russell','ruth','ryan','sabrina','sally',
  'sam','samantha','samuel','sandra','sandy','sara','sarah','scott','sean','seth','shane','shannon',
  'sharon','shawn','sheila','shelly','sherry','shirley','sophia','stacey','stacy','stanley','stella',
  'stephanie','stephen','steve','steven','sue','susan','suzanne','tamara','tammy','tanya','tara',
  'taylor','ted','teresa','terri','terry','theresa','thomas','tiffany','tim','timothy','tina','todd',
  'tom','tommy','tony','tonya','tracey','tracy','travis','trent','trevor','troy','tyler','valerie',
  'vanessa','vernon','vicki','victor','victoria','vincent','virginia','vivian','wade','walter','wanda',
  'warren','wayne','wendy','wesley','whitney','william','willie','zachary','zach',
  // Common nicknames / short forms — missing from base list caused live test
  // to render "Hey [no greeting]," when contact_person was "Nate" (producing
  // a cold-looking open). Extending coverage keeps greeting intact for the
  // nicknames real small-business owners actually use.
  'abby','al','ali','allie','ally','andi','angie','barb','bea','ben','benny','bert','bev','bill',
  'bo','bonn','brad','brie','cal','cam','carl','caro','cas','cass','cat','cathy','cece','chad','chas',
  'chip','chrissy','cici','cj','cliff','connie','cris','dani','debi','dee','deedee','del','demi','dez',
  'dom','dominic','don','dot','drew','edie','el','ellie','em','ernie','ess','finn','fran','francis',
  'fred','freddie','freddy','gabby','gabe','gene','georgie','gil','ginny','gus','hal','hank','harv',
  'hunt','ike','izzy','jackie','jake','jan','jas','jeb','jen','jenna','jerry','jess','jessie','jim',
  'jo','jodi','jodie','jody','joelle','joey','jojo','jon','jules','june','kaci','kacy','kara','kas',
  'kass','kat','kate','katy','kay','ken','kira','kit','kris','kristy','lance','lani','lara','larry',
  'les','lex','lexi','lili','lily','liz','lizzie','lois','lori','lou','louie','luc','lucy','luis',
  'mac','maddie','mal','manny','marc','marco','margie','marty','mary','mattie','matty','meg','mel',
  'mia','mike','milo','mitch','moe','mona','nat','nate','ned','nelly','nessa','nick','niki','nikki',
  'nina','norm','ollie','otto','pat','paddy','paige','pat','pete','phil','pip','ray','reg','rich',
  'rick','rita','rob','robby','ron','rory','rosa','roxy','rudy','rusty','sal','sally','sammy','sandy',
  'shan','shay','shea','shel','sid','sonia','sonny','stan','steph','sue','suze','syd','tad','tam',
  'tate','teddy','tess','thad','theo','tiff','toby','todd','toby','trish','trixie','van','vic','vince',
  'vinny','vinnie','wade','wally','walt','wes','will','winnie','yvette','zack','zane',
]);

// Single-word strings that LOOK like names (capitalized, in COMMON_NAMES or
// pass other checks) but are actually industry/marketing/company words scraped
// from page titles, company names, or meta descriptions. Production data shows
// leads addressed as "Hey Santa", "Hey Plumber", "Hey Best" because these
// single capitalized words slipped through getFirstName's single-word branch.
const NAME_BLOCKLIST = new Set([
  // Marketing/descriptor words
  'santa','best','top','trusted','local','premier','elite','quality','professional',
  'affordable','expert','licensed','certified','family','welcome','home','office',
  'schedule','book','booking','about','contact','services','service','team','staff',
  'admin','support','help','sales','billing','marketing','general','main','meet',
  'our','providers','doctors','attorneys','agents','faq','blog','news','gallery',
  'pricing','careers','jobs','login','signup','register','reviews','testimonials',
  // Industry/occupation words (same as BUSINESS_KEYWORDS but lowercased for O(1) lookup)
  'plumber','plumbing','electric','electrician','hvac','roofing','construction',
  'landscaping','painting','cleaning','auto','dental','dent','chiro','chiropractic',
  'chiropractor','realty','group','associates','partners','practice','clinic',
  'center','centre','agency','firm','studio','shop','salon','spa','insurance',
  'financial','consulting','solutions','properties','management','advisors',
  'veterinary','vet','orthodont','pediatric','medical','health','wellness','fitness',
  'yoga','crossfit','barber','beauty','legal','law','accounting','tax',
  // Generic words that showed up in production
  'attention','required','allow','discover','opportunities','explore','click',
  'learn','submit','request','start','join','free','limited','exclusive',
]);

// Role-based email prefixes that aren't real names
const ROLE_PREFIXES = new Set([
  'info','admin','support','office','team','hello','contact','reception','receptionist',
  'hr','billing','sales','marketing','frontdesk','staff','help','service','services',
  'accounts','accounting','mail','webmaster','postmaster','noreply','no-reply',
  'enquiries','inquiry','inquiries','general','main','ops','operations','management',
  'careers','jobs','press','media','news','feedback','complaints','legal',
]);

// Business keywords that indicate a contact_name is actually a company name
const BUSINESS_KEYWORDS = /\b(llc|inc|corp|ltd|co|law|legal|dental|dent|chiro|chiropractic|realty|real estate|group|associates|partners|practice|clinic|center|centre|agency|firm|studio|shop|salon|spa|insurance|financial|consulting|solutions|services|properties|mgmt|management|advisors|plumbing|electric|hvac|roofing|construction|landscaping|painting|cleaning|auto|veterinary|vet|orthodont|pediatr|physical therapy|pt|med|medical|health|wellness|fitness|yoga|crossfit|barber|beauty)\b/i;

// Page-title words that indicate contact_name was scraped from a web page
const PAGE_TITLE_WORDS = /^(about|contact|home|meet|our|services|welcome|team|staff|providers|doctors|attorneys|agents|location|office|schedule|book|faq|blog|news|testimonials|reviews|gallery|portfolio|pricing|careers|jobs|login|sign|register)\b/i;

// Professional descriptors often found at end of company names
const TRAILING_DESCRIPTORS = /\s*[-–—,]\s*(chiropractor|dentist|attorney|lawyer|realtor|real estate agent|cpa|accountant|plumber|electrician|doctor|physician|therapist|counselor|consultant|advisor|broker|agent|specialist|professional|expert|contractor|orthodontist|pediatrician|veterinarian|optometrist|dermatologist|surgeon|practitioner)s?\s*$/i;

// Location suffixes like "in City, ST" or "| City, State"
const LOCATION_SUFFIX = /\s*[-–—|]\s*(in\s+)?[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\s*$/;
const LOCATION_SUFFIX_FULL = /\s*[-–—|]\s*(in\s+)?[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+\s*$/;

/**
 * Extract a first name from an email address local part.
 * e.g., "pam.osborne@firm.com" → "Pam"
 *       "drzachhaley@gmail.com" → "Zach"
 *       "info@company.com" → null
 */
function extractFirstNameFromEmail(email) {
  if (!email || !email.includes('@')) return null;

  let local = email.split('@')[0].toLowerCase().trim();

  // Reject role-based addresses
  if (ROLE_PREFIXES.has(local)) return null;

  // Strip common prefixes like "dr", "dr."
  local = local.replace(/^dr\.?/i, '');

  // Try splitting on separators: . _ -
  if (/[._-]/.test(local)) {
    const parts = local.split(/[._-]/);
    const candidate = parts[0];
    // Reject if the first part is a role
    if (ROLE_PREFIXES.has(candidate)) return null;
    // Reject very short parts (likely initials)
    if (candidate.length < 2) return null;
    // Reject if it looks like all numbers
    if (/^\d+$/.test(candidate)) return null;
    return capitalize(candidate);
  }

  // No separator — try matching against common names dictionary
  // Check if local part starts with a known name (min 3 chars to avoid false positives)
  for (const name of COMMON_NAMES) {
    if (name.length >= 3 && local.startsWith(name) && local.length > name.length) {
      return capitalize(name);
    }
  }

  // If the whole local part is a known name, use it
  if (COMMON_NAMES.has(local) && local.length >= 3) {
    return capitalize(local);
  }

  // If local part is short-ish and looks like a name (all alpha, reasonable length)
  if (/^[a-z]{2,12}$/.test(local) && !ROLE_PREFIXES.has(local)) {
    // Could be a name, but we're not sure — only return if it's in our dictionary
    return null;
  }

  return null;
}

// Whole-string patterns that indicate the value is a page title / nav label,
// not a real company name. Used by both cleanCompanyName fallback and
// looksLikePageTitle so new leads with garbage inputs can route to a
// domain-derived fallback instead of putting "Meet Our Team" in a subject line.
const PAGE_TITLE_WHOLE = /^(contact( us| our| page)?|meet( our| the)? (team|staff|attorneys|doctors|agents|providers)|our (team|staff|company|agents|location|doctors|attorneys|providers)|about( us)?|home|welcome|services|our services|schedule|book (now|an appointment)|agents|roster|faq|blog|news|testimonials|reviews|gallery|portfolio|pricing|careers|jobs|login|sign in|register|location|small business (accounting|attorney)|real estate agents?|best (dentists?|doctors?|agents?|attorneys?)( near me)?( in .+)?|fee[- ]only (financial )?advisors?( .+)?)$/i;

// Detect if a string looks like a page title or nav link rather than a real company name.
// Catches the values that leak from scraper output when the site's <title> or nav menu
// gets used as business_name.
function looksLikePageTitle(str) {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (trimmed.length === 0) return true;
  // Exact match against whole-string patterns
  if (PAGE_TITLE_WHOLE.test(trimmed)) return true;
  // Starts with page-title word followed by space/end
  if (/^(contact|meet|our|about|welcome|schedule|book|agents?|roster)\b/i.test(trimmed)) {
    // But allow "Our Lady of Grace" (real business name) — check for page-title markers
    if (/\b(team|staff|company|services|location|attorneys|doctors|agents|providers|page)\b/i.test(trimmed)) return true;
    if (trimmed.split(/\s+/).length <= 3) return true; // "Contact Us", "Meet Our Team"
  }
  // Sentence-like with punctuation (meta descriptions, CTAs).
  // "?" or "!" anywhere, OR two period-terminated sentences in a row.
  if (/[!?]/.test(trimmed)) return true;
  if (/\.\s+[A-Za-z].*\.\s*$/.test(trimmed)) return true;
  // "[City], [ST] BusinessType" — SerpAPI result-title template, never a real company name.
  // e.g. "Panama City, FL Accounting Firm", "Baton Rouge, LA CPA Firm", "Raleigh, NC Dentist"
  // The third token can be title-case (Accounting) or all-caps (CPA).
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\s+[A-Z]\w*/.test(trimmed)) return true;
  // "[City] BusinessType" with no company proper noun — e.g. "Raleigh, NC Dentist"
  if (/^[A-Z][a-z]+,\s*[A-Z]{2}\s+(Dentist|CPA|Attorney|Lawyer|Realtor|Chiropractor|Advisor|Accountant|Agent|Therapist|Doctor|Physician)\s*$/i.test(trimmed)) return true;
  // All caps, longer than acronym
  if (/^[A-Z\s&]+$/.test(trimmed) && trimmed.replace(/\s/g, '').length > 4) return true;
  return false;
}

// Extract a reasonable company name from the email domain as a final fallback.
// e.g., "watermarkdental.com" → "Watermark Dental"
//       "wellsfargoadvisors.com" → "Wells Fargo Advisors"
// Imperfect, but always produces something non-garbage for the AI prompt.
function extractCompanyFromDomain(email) {
  if (!email || !email.includes('@')) return '';
  const domain = email.split('@')[1].toLowerCase();
  // Strip common public domains — we can't derive a company name from gmail/yahoo/etc.
  const publicDomains = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com', 'comcast.net', 'verizon.net', 'att.net', 'cox.net', 'sbcglobal.net', 'cableone.net']);
  if (publicDomains.has(domain)) return '';
  // Strip TLD and www. prefix
  const base = domain.replace(/^www\./, '').replace(/\.(com|net|org|io|co|us|biz|info)$/i, '');
  // Split camelCase and hyphens into words, then capitalize each
  const words = base
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
  // Insert spaces between concatenated known words when possible
  // (basic heuristic: split before known company suffixes like "law", "cpa", "dental", etc.)
  const splits = /(law|cpa|dental|dentistry|chiropractic|realty|realestate|wealth|financial|advisors?|accounting|insurance|plumbing|electric|hvac|roofing|construction|landscaping|therapy|medical|health|group|associates|partners|consulting|properties|firm|office|clinic|center|centre|studio|shop|salon|spa|fitness)/gi;
  const expanded = words.map(w => w.replace(splits, ' $1').trim().replace(/\s+/g, ' ')).join(' ').split(/\s+/).filter(Boolean);
  return expanded.map(capitalize).join(' ');
}

/**
 * Clean page-title cruft from company names.
 * e.g., "Highland Dental Center: Dentist in Salt Lake City, UT" → "Highland Dental Center"
 *       "Smith Law Firm | Attorneys - Dallas, TX" → "Smith Law Firm"
 *       "About - Johnson Chiropractic..." → "Johnson Chiropractic"
 *       "Contact Us" + email='x@watermarkdental.com' → "Watermark Dental"
 *
 * Second arg is optional — when provided, falls back to extracting a company
 * name from the email domain if the cleaned name still looks like a page title.
 */
function cleanCompanyName(rawName, fallbackEmail) {
  if (!rawName || typeof rawName !== 'string') {
    // No usable raw name — try domain fallback
    return fallbackEmail ? extractCompanyFromDomain(fallbackEmail) : '';
  }

  let name = rawName.trim();

  // Remove trailing ellipsis
  name = name.replace(/\.{2,}$/, '').trim();

  // Split on common page-title delimiters and take the most meaningful segment
  const delimiters = /\s*[-–—|]+\s+|\s*:\s+|\s+[-–—|:]+\s*/;
  if (delimiters.test(name)) {
    const segments = name.split(delimiters).map(s => s.trim()).filter(s => s.length > 0);

    // Filter out segments that are page-title words or location patterns
    const meaningful = segments.filter(seg =>
      !PAGE_TITLE_WORDS.test(seg) &&
      !PAGE_TITLE_WHOLE.test(seg) &&
      !/^(in\s+)?[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z]{2}$/.test(seg) &&
      !/^(in\s+)?[A-Z][a-z]+(\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+$/.test(seg)
    );

    // Take the first meaningful segment (usually the company name)
    name = meaningful.length > 0 ? meaningful[0] : segments[0];
  }

  // Remove trailing professional descriptors
  name = name.replace(TRAILING_DESCRIPTORS, '').trim();

  // Remove location suffixes
  name = name.replace(LOCATION_SUFFIX, '').trim();
  name = name.replace(LOCATION_SUFFIX_FULL, '').trim();

  // Remove trailing ellipsis again (in case it was after a delimiter)
  name = name.replace(/\.{2,}$/, '').trim();

  // If the result STILL looks like a page title, fall back to the email domain
  // (or raw name if no email provided). This catches "Contact Us", "Meet Our Team",
  // "Panama City, FL Accounting Firm" — strings that have no delimiter to split on
  // but also aren't a real business name.
  if (looksLikePageTitle(name) || name.length < 2) {
    const fromDomain = fallbackEmail ? extractCompanyFromDomain(fallbackEmail) : '';
    if (fromDomain && fromDomain.length >= 3) return fromDomain;
    return rawName.trim(); // nothing better available
  }

  return name;
}

/**
 * Master function: get a real first name for a lead.
 * Tries contact_name first, then falls back to email parsing.
 *
 * @param {string} contactName - The raw contact name from the database
 * @param {string} contactEmail - The contact's email address
 * @returns {string} A first name or 'there' as fallback
 */
function getFirstName(contactName, contactEmail) {
  // Check if contactName looks like a real person name
  if (contactName && typeof contactName === 'string') {
    const trimmed = contactName.trim();
    const words = trimmed.split(/\s+/);

    // Strip honorific prefixes (Dr., Mr., Mrs., Ms., Prof.)
    let nameWords = [...words];
    if (nameWords.length >= 2 && /^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?)$/i.test(nameWords[0])) {
      nameWords = nameWords.slice(1);
    }

    const isRealName =
      nameWords.length >= 1 &&
      words.length >= 2 && // original must have 2+ words
      /^[A-Z]/.test(nameWords[0]) &&
      !BUSINESS_KEYWORDS.test(trimmed) &&
      !PAGE_TITLE_WORDS.test(trimmed) &&
      // Not a URL or domain pattern
      !/\.(com|net|org|io|co|us|biz)$/i.test(trimmed) &&
      // Not a single word repeated or very long (likely a business name scraped from page)
      nameWords[0].length <= 15 &&
      // First word should look like a name (alpha only, reasonable length)
      /^[A-Za-z'-]+$/.test(nameWords[0]) &&
      nameWords[0].length >= 2 &&
      // Reject page titles / CTA phrases / meta descriptions
      !(/[!?]/.test(trimmed)) &&
      !(/\b(allow|discover|attention|required|click|opportunities|explore|submit|request|exclusive)\b/i.test(trimmed)) &&
      // Blocklist common industry/marketing words that look like names
      !NAME_BLOCKLIST.has(nameWords[0].toLowerCase());

    if (isRealName) {
      return nameWords[0];
    }

    // Single-word name — only if it's in our common names dictionary AND not blocklisted.
    // Blocklist prevents "Santa", "Plumber", "Best" from passing even though they match COMMON_NAMES
    // or look name-like. Length >= 3 also rejects two-letter initials.
    if (
      words.length === 1 &&
      words[0].length >= 3 &&
      COMMON_NAMES.has(words[0].toLowerCase()) &&
      !NAME_BLOCKLIST.has(words[0].toLowerCase()) &&
      !PAGE_TITLE_WORDS.test(words[0])
    ) {
      return capitalize(words[0]);
    }
  }

  // Fall back to email extraction
  const fromEmail = extractFirstNameFromEmail(contactEmail);
  if (fromEmail) return fromEmail;

  // Final fallback
  return 'there';
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const ROLE_BASED_PREFIX = /^(info|support|contact|admin|office|sales|help|billing|legal|hr|marketing|hello|general|team|directory|reception|inquiries|enquiries|careers|jobs|media|press|service|feedback|accounts|mail|staff)@/i;

function isRoleBasedEmail(email) {
  return ROLE_BASED_PREFIX.test(email);
}

/**
 * Returns true only if `str` is plausibly a real first name.
 * Centralizes the same rejection logic used inside getFirstName so callers
 * upstream (leadgen.service.js, outreach-ai.service.js) can pre-check inputs
 * without duplicating the checks.
 */
function looksLikePersonName(str) {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);

  // Strip honorifics before checking
  let nameWords = [...words];
  if (nameWords.length >= 2 && /^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?)$/i.test(nameWords[0])) {
    nameWords = nameWords.slice(1);
  }

  // Universal rejections
  if (/[!?]/.test(trimmed)) return false;
  if (/\b(allow|discover|attention|required|click|opportunities|explore|submit|request|exclusive)\b/i.test(trimmed)) return false;
  if (BUSINESS_KEYWORDS.test(trimmed)) return false;
  if (PAGE_TITLE_WORDS.test(trimmed)) return false;
  if (/\.(com|net|org|io|co|us|biz)$/i.test(trimmed)) return false;
  if (NAME_BLOCKLIST.has(nameWords[0].toLowerCase())) return false;

  // Multi-word branch
  if (words.length >= 2) {
    return (
      /^[A-Z]/.test(nameWords[0]) &&
      /^[A-Za-z'-]+$/.test(nameWords[0]) &&
      nameWords[0].length >= 2 &&
      nameWords[0].length <= 15
    );
  }

  // Single-word branch — must be in dictionary and not blocklisted
  return (
    words[0].length >= 3 &&
    COMMON_NAMES.has(words[0].toLowerCase()) &&
    !PAGE_TITLE_WORDS.test(words[0])
  );
}

module.exports = { extractFirstNameFromEmail, cleanCompanyName, getFirstName, isRoleBasedEmail, looksLikePageTitle, looksLikePersonName, extractCompanyFromDomain, NAME_BLOCKLIST, COMMON_NAMES };
