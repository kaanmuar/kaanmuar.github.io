/* Sites the social networks restrict: adult content, and gambling, betting and lotteries (#1929). Their reviews stay
   in the Live Reports, but their posts are held from every network, and a clip never shows their pages or icons.
   kind({ host, titles, html }) returns "adult", "gambling" or "". Each signal must stand on its own: a word inside a
   longer word ("Essex", "alphabet", "better") never counts. */

const ADULT_WORDS = /\b(porn\w*|porno|xxx+|hentai|nsfw|jav|milfs?|nudes|erotic\w*|escort (?:girls|services?|agency)|camgirls?|webcams? (?:girls|sex)|sex (?:videos?|movies?|chat|cams?|tube)|xvideos|xnxx|xhamster|pornhub|redtube|adult (?:videos?|movies?|content|entertainment|site)|18\+ (?:videos?|content)|putas|follando|porr)\b/i;
const ADULT_HOST = /(^|[.-])(porn\w*|xxx\w*|hentai\w*|xvideos?|xnxx|xhamster|sex\w*|jav(?![aei])\w*|nsfw|camgirl\w*|escort\w*|nude\w*|milf\w*|onlyfans)([.-]|$)/i;
// The RTA label adult sites set for parental filters, and the rating meta tag.
const ADULT_TAGS = /RTA-5042-1996-1400-1577-RTA|<meta[^>]+name=["']?rating["']?[^>]+content=["']?(adult|mature|RTA)/i;
const AGE_GATE = /\b(are you (?:over )?18|i am (?:over )?18|over 18 (?:only|years)|18 years (?:or older|of age)|must be (?:at least )?18|you must be 18|enter only if you are 18|mayor de (?:18|edad)|maior de 18|plus de 18 ans|über 18|maggiorenne)\b/i;

const GAMBLING_WORDS = /\b(casinos?|sportsbook|sports betting|betting|bet now|place your bets?|poker|online slots|slot machines?|jackpots?|roulette|baccarat|blackjack|bookmakers?|apuestas|apostas|cassino|sportwetten|scommesse|paris sportifs|lotter(?:y|ies)|lotto|loter[ií]as?|powerball)\b/i;
const GAMBLING_HOST = /(^|[.-])(casino\w*|poker\w*|slots?\w*|bet365|1xbet|betway|betfair|betano|betsson|bwin|sportsbook\w*|lotto\w*|lottery\w*|loteria\w*|powerball|bingo\w*|apuestas\w*|apostas\w*)([.-]|$)/i;

const text = (html) => String(html || "").slice(0, 300000).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");

function kind({ host = "", titles = [], html = "" } = {}) {
  const head = [].concat(titles).join(" · ");
  const meta = (String(html).match(/<title[^>]*>[^<]*|<meta[^>]+(?:name|property)=["']?(?:description|og:title|og:description|keywords)["']?[^>]*>/gi) || []).join(" ");
  const said = head + " " + meta.replace(/<[^>]+?content=["']?/gi, " ");
  if (ADULT_HOST.test(host) || ADULT_TAGS.test(html) || ADULT_WORDS.test(said) || (AGE_GATE.test(text(html).slice(0, 20000)) && !GAMBLING_WORDS.test(said))) return "adult";
  if (GAMBLING_HOST.test(host) || GAMBLING_WORDS.test(said)) return "gambling";
  return "";
}

module.exports = { kind };
