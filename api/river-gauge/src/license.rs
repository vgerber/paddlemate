//! Derives a linkable license from Rivermap's free-text `licensingTerms`.
//!
//! The upstream strings are prose written by hand, so they vary a lot:
//! most name a license in a reversed-Markdown link, `(CC BY 4.0)[url]`, with
//! the brackets the wrong way round; some use proper `[text](url)`; some name
//! the license only in prose and link a dataset page instead; and about two
//! thirds state no license at all. We resolve them once at import time and
//! store the result, so the UI can render a stable label and link.

/// A license we can point the reader at.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct License {
    /// Short display label, e.g. "CC BY 4.0". `None` when the terms link
    /// somewhere useful but name no license we recognise.
    pub name: Option<String>,
    /// Where the terms can be read. `None` when the source states no license,
    /// in which case the caller falls back to the distributor's own site.
    pub url: Option<String>,
}

/// Licenses that appear in the data, most specific pattern first: "CC BY-SA"
/// has to be tested before "CC BY", or it would match the shorter one.
/// Patterns are matched case-insensitively against the whole terms string.
const KNOWN: &[(&[&str], &str, &str)] = &[
    (
        &["cc by-nc-nd 3.0", "cc-by-nc-nd 3.0", "do not use commercially"],
        "CC BY-NC-ND 3.0 CZ",
        "https://creativecommons.org/licenses/by-nc-nd/3.0/cz/",
    ),
    (
        &[
            "cc by-sa 4.0",
            "cc-by-sa 4.0",
            "attribution-sharealike 4.0",
        ],
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0/",
    ),
    (
        &["cc by 4.0", "cc-by 4.0", "attribution 4.0"],
        "CC BY 4.0",
        "https://creativecommons.org/licenses/by/4.0/",
    ),
    (
        &["cczero", "cc-zero", "cc0"],
        "CC0 1.0",
        "https://creativecommons.org/publicdomain/zero/1.0/",
    ),
    (
        &["nlod", "norwegian licence for open government data"],
        "NLOD",
        "https://data.norge.no/nlod/en/",
    ),
    (
        &["lo 2.0", "license ouverte"],
        "Licence Ouverte 2.0",
        "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
    ),
    (
        &["iodl 2.0"],
        "IODL 2.0",
        "https://www.dati.gov.it/content/italian-open-data-license-v20",
    ),
    (
        &["open government licence"],
        "Open Government Licence v3",
        "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    ),
];

/// Link labels that carry no information, so the license name has to come
/// from the prose or the URL instead.
const GENERIC_LABELS: &[&str] = &[
    "this link",
    "here",
    "link",
    "this page",
    "this document",
    "more info",
];

/// Extracts a license label and URL from a source's terms.
///
/// Returns an empty `License` when the source states no formal license - the
/// caller then falls back to linking the distributor's own site.
pub fn parse_license(terms: &str) -> License {
    // A named license wins over any embedded link: several sources name the
    // license in prose but link a dataset page, and we would rather send the
    // reader to the license itself. It also collapses the language variants
    // (deed.de, deed.it) onto one canonical URL.
    let haystack = terms.to_lowercase();
    for (patterns, name, url) in KNOWN {
        if patterns.iter().any(|p| contains_word(&haystack, p)) {
            return License {
                name: Some((*name).to_string()),
                url: Some((*url).to_string()),
            };
        }
    }

    // Otherwise take whatever the terms link to, if anything.
    match extract_link(terms) {
        Some((label, url)) => License {
            name: label.filter(|l| !is_generic(l)),
            url: Some(url),
        },
        None => License::default(),
    }
}

/// Substring match that refuses to start or end inside a word, so a pattern
/// like "lo 2.0" matches "(LO 2.0)" but never "modello 2.0".
fn contains_word(haystack: &str, needle: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = haystack[from..].find(needle) {
        let start = from + pos;
        let end = start + needle.len();
        let ok_before = haystack[..start]
            .chars()
            .next_back()
            .is_none_or(|c| !c.is_alphanumeric());
        let ok_after = haystack[end..]
            .chars()
            .next()
            .is_none_or(|c| !c.is_alphanumeric());
        if ok_before && ok_after {
            return true;
        }
        from = start + 1;
    }
    false
}

fn is_generic(label: &str) -> bool {
    let lowered = label.trim().to_lowercase();
    GENERIC_LABELS.iter().any(|g| lowered == *g)
}

/// Finds the first link in either the reversed `(label)[url]` form that
/// dominates this data or the standard `[label](url)` form, whichever comes
/// first. Returns the label (when present) and the URL.
fn extract_link(terms: &str) -> Option<(Option<String>, String)> {
    let reversed = find_link(terms, ')', '[', ']', '(');
    let standard = find_link(terms, ']', '(', ')', '[');
    match (reversed, standard) {
        (Some(r), Some(s)) => Some(if r.0 <= s.0 { r.1 } else { s.1 }),
        (Some(r), None) => Some(r.1),
        (None, Some(s)) => Some(s.1),
        (None, None) => None,
    }
}

/// Scans for `<label_close><url_open>URL<url_close>` and walks back to the
/// opening delimiter to recover the label. Returns the match position so the
/// caller can pick whichever form appears first.
fn find_link(
    terms: &str,
    label_close: char,
    url_open: char,
    url_close: char,
    label_open: char,
) -> Option<(usize, (Option<String>, String))> {
    let bytes: Vec<char> = terms.chars().collect();
    for i in 0..bytes.len().saturating_sub(1) {
        if bytes[i] != label_close || bytes[i + 1] != url_open {
            continue;
        }
        let url_start = i + 2;
        let Some(offset) = bytes[url_start..].iter().position(|c| *c == url_close) else {
            continue;
        };
        let url_end = url_start + offset;
        let url: String = bytes[url_start..url_end].iter().collect();
        // One source wraps its URL in stray whitespace.
        let url = url.trim().to_string();
        if !url.starts_with("http") {
            continue;
        }
        // Walk back to the matching opener so nested parens in a label like
        // "(Creative Commons CCZero 1.0 License (cc-zero))" survive.
        let mut depth = 0usize;
        let mut label = None;
        for j in (0..i).rev() {
            if bytes[j] == label_close {
                depth += 1;
            } else if bytes[j] == label_open {
                if depth == 0 {
                    label = Some(bytes[j + 1..i].iter().collect::<String>());
                    break;
                }
                depth -= 1;
            }
        }
        return Some((i, (label, url)));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn named(terms: &str) -> (String, String) {
        let l = parse_license(terms);
        (l.name.expect("name"), l.url.expect("url"))
    }

    #[test]
    fn no_formal_license_yields_nothing() {
        // 48 of the 77 sources look like this.
        let l = parse_license(
            "Data is not validated. We are not aware of a formal license. \
             Please publicly credit the station data and observations to the \
             source organisation",
        );
        assert_eq!(l, License::default());
    }

    #[test]
    fn reversed_markdown_is_the_common_form() {
        assert_eq!(
            named("Data is not validated and is released by the authority under (IODL 2.0)[https://www.dati.gov.it/content/italian-open-data-license-v20], a license compatible with CC-BY-SA and ODbL."),
            ("IODL 2.0".into(), "https://www.dati.gov.it/content/italian-open-data-license-v20".into())
        );
    }

    #[test]
    fn standard_markdown_also_parses() {
        assert_eq!(
            named("Data is released by the authority under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/deed.de)"),
            ("CC BY 4.0".into(), "https://creativecommons.org/licenses/by/4.0/".into())
        );
    }

    #[test]
    fn language_variants_collapse_onto_one_canonical_url() {
        let de = named("under (CC BY 4.0)[https://creativecommons.org/licenses/by/4.0/deed.de]");
        let it = named("under (CC BY 4.0)[https://creativecommons.org/licenses/by/4.0/deed.it]");
        assert_eq!(de, it);
    }

    #[test]
    fn stray_whitespace_inside_the_url_is_trimmed() {
        // The only source that does this also names its license, so drop the
        // name to force the link path.
        let l = parse_license("released under the terms at (this link)[ https://example.org/terms ]");
        assert_eq!(l.url.as_deref(), Some("https://example.org/terms"));
    }

    #[test]
    fn generic_link_labels_do_not_become_license_names() {
        let l = parse_license(
            "Data is released by the authority under the license found at (this link)[https://danepubliczne.imgw.pl/regulations]",
        );
        assert_eq!(l.name, None);
        assert_eq!(l.url.as_deref(), Some("https://danepubliczne.imgw.pl/regulations"));
    }

    #[test]
    fn nested_parens_in_a_label_survive() {
        assert_eq!(
            named("licensed under a (Creative Commons CCZero 1.0 License (cc-zero))[https://opendefinition.org/licenses/cc-zero/]"),
            ("CC0 1.0".into(), "https://creativecommons.org/publicdomain/zero/1.0/".into())
        );
    }

    #[test]
    fn a_named_license_beats_an_unrelated_dataset_link() {
        // Trentino names CC BY 4.0 in prose but links its dataset page.
        assert_eq!(
            named("released by the authority under Creative Commons Attribution 4.0.\r\nMore info [here](https://dati.trentino.it/dataset/rilevamento-sensori-idrometrici-livello)"),
            ("CC BY 4.0".into(), "https://creativecommons.org/licenses/by/4.0/".into())
        );
    }

    #[test]
    fn share_alike_is_not_mistaken_for_plain_attribution() {
        assert_eq!(named("under (CC BY-SA 4.0)[https://creativecommons.org/licenses/by-sa/4.0/].").0, "CC BY-SA 4.0");
        assert_eq!(named("Attribution-ShareAlike 4.0 International license").0, "CC BY-SA 4.0");
    }

    #[test]
    fn non_commercial_czech_license_is_not_mistaken_for_cc_by() {
        assert_eq!(
            named("under [Creative Commons Indicate origin-Do not use commercially-Do not process 3.0 Czech Republic (CC BY-NC-ND 3.0 CZ)](https://creativecommons.org/licenses/by-nc-nd/3.0/cz/)").0,
            "CC BY-NC-ND 3.0 CZ"
        );
    }

    #[test]
    fn prose_only_licenses_resolve() {
        assert_eq!(
            named("released by the authority under the Norwegian Licence for Open Government Data (NLOD).\r\nMore info [here](https://data.norge.no/nlod/en/)").0,
            "NLOD"
        );
        assert_eq!(
            named("under (LO 2.0)[https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf], an open, attribution-based license").0,
            "Licence Ouverte 2.0"
        );
    }


    /// Every distinct licensing string Rivermap actually ships (August 2026),
    /// pinned to its reviewed classification. Editing the license table must
    /// consciously update this - a silent reclassification is the failure
    /// mode this test exists to catch.
    #[test]
    fn the_real_corpus_classifies_as_reviewed() {
        #[rustfmt::skip]
        let corpus: &[(&str, Option<&str>, Option<&str>)] = &[
            ("Data is not validated and is licensed by the authority under a (Creative Commons CCZero 1.0 License (cc-zero))[https://opendefinition.org/licenses/cc-zero/]", Some("CC0 1.0"), Some("https://creativecommons.org/publicdomain/zero/1.0/")),
            ("Data is not validated and is provided by the authority (SHMU) in accordance with Act no. 211/2000 Coll. on free access to information and on the amendment of certain laws as amended (the Freedom of Information Act). More information is available at (this link)[https://www.shmu.sk/sk/?page=1712] ", None, Some("https://www.shmu.sk/sk/?page=1712")),
            ("Data is not validated and is released by Rivermap under (CC-BY-SA 4.0)[https://creativecommons.org/licenses/by-sa/4.0/deed.en]", Some("CC BY-SA 4.0"), Some("https://creativecommons.org/licenses/by-sa/4.0/")),
            ("Data is not validated and is released by the authority under (CC BY 4.0)[ https://creativecommons.org/licenses/by/4.0/]", Some("CC BY 4.0"), Some("https://creativecommons.org/licenses/by/4.0/")),
            ("Data is not validated and is released by the authority under (CC BY 4.0)[https://creativecommons.org/licenses/by/4.0/deed.it]", Some("CC BY 4.0"), Some("https://creativecommons.org/licenses/by/4.0/")),
            ("Data is not validated and is released by the authority under (CC BY-SA 4.0)[https://creativecommons.org/licenses/by-sa/4.0/].\nMore info [here](https://www.arpa.piemonte.it/note-legali).", Some("CC BY-SA 4.0"), Some("https://creativecommons.org/licenses/by-sa/4.0/")),
            ("Data is not validated and is released by the authority under (CC BY-SA 4.0)[https://creativecommons.org/licenses/by-sa/4.0/].\nMore info [here](https://www.regione.vda.it/informazioni_utili/note_legali_i.asp).", Some("CC BY-SA 4.0"), Some("https://creativecommons.org/licenses/by-sa/4.0/")),
            ("Data is not validated and is released by the authority under (IODL 2.0)[https://www.dati.gov.it/content/italian-open-data-license-v20], a license compatible with CC-BY-SA and ODbL.\nMore info [here](https://www.dati.gov.it/content/italian-open-data-license-domande-risposte).", Some("IODL 2.0"), Some("https://www.dati.gov.it/content/italian-open-data-license-v20")),
            ("Data is not validated and is released by the authority under (LO 2.0)[https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf], an open, attribution-based license compatible with CC-BY 2.0 and ODbL.\nMore info [here](https://www.etalab.gouv.fr/licence-ouverte-open-licence).", Some("Licence Ouverte 2.0"), Some("https://www.etalab.gouv.fr/licence-ouverte-open-licence")),
            ("Data is not validated and is released by the authority under CC-BY 4.0.\nMore info [here](https://monitor.protezionecivile.fvg.it/#/licenza).", Some("CC BY 4.0"), Some("https://creativecommons.org/licenses/by/4.0/")),
            ("Data is not validated and is released by the authority under Creative Commons Attribution 4.0.\nMore info [here](https://dati.lazio.it/it/faq).", Some("CC BY 4.0"), Some("https://creativecommons.org/licenses/by/4.0/")),
            ("Data is not validated and is released by the authority under Creative Commons Attribution 4.0.\nMore info [here](https://dati.trentino.it/dataset/rilevamento-sensori-idrometrici-livello) then individual pages like [here](https://dati.trentino.it/dataset/rilevamento-sensori-idrometrici-livello/resource/49ab7049-e8d9-4b29-b130-72928f6d5bea).", Some("CC BY 4.0"), Some("https://creativecommons.org/licenses/by/4.0/")),
            ("Data is not validated and is released by the authority under Creative Commons Attribution-ShareAlike 4.0 International license. See more at (this link)[https://www.gipuzkoa.eus/es/aviso-legal]", Some("CC BY-SA 4.0"), Some("https://creativecommons.org/licenses/by-sa/4.0/")),
            ("Data is not validated and is released by the authority under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/deed.de)", Some("CC BY 4.0"), Some("https://creativecommons.org/licenses/by/4.0/")),
            ("Data is not validated and is released by the authority under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/deed.de). More info [here](https://www.data.gv.at/katalog/dataset/5459cb0a-8cc3-4056-8717-c60febeafded).", Some("CC BY 4.0"), Some("https://creativecommons.org/licenses/by/4.0/")),
            ("Data is not validated and is released by the authority under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/deed.de). More info [here](https://www.data.gv.at/katalog/dataset/6772e22a-a364-47df-9cf7-0590fdde1757). Terms of use are [here](https://www.tirol.gv.at/data/nutzungsbedingungen/)", Some("CC BY 4.0"), Some("https://creativecommons.org/licenses/by/4.0/")),
            ("Data is not validated and is released by the authority under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/deed.de). More info [here](https://www.hnd.bayern.de/impressum).", Some("CC BY 4.0"), Some("https://creativecommons.org/licenses/by/4.0/")),
            ("Data is not validated and is released by the authority under [Creative Commons Indicate origin-Do not use commercially-Do not process 3.0 Czech Republic (CC BY-NC-ND 3.0 CZ)](https://creativecommons.org/licenses/by-nc-nd/3.0/cz/)", Some("CC BY-NC-ND 3.0 CZ"), Some("https://creativecommons.org/licenses/by-nc-nd/3.0/cz/")),
            ("Data is not validated and is released by the authority under [Creative Commons Indicate origin-Do not use commercially-Do not process 3.0 Czech Republic (CC BY-NC-ND 3.0 CZ)](https://creativecommons.org/licenses/by-nc-nd/3.0/cz/). License is indicated at bottom of [each page](https://hydro.chmi.cz/hpps/hpps_oplist.php).  ", Some("CC BY-NC-ND 3.0 CZ"), Some("https://creativecommons.org/licenses/by-nc-nd/3.0/cz/")),
            ("Data is not validated and is released by the authority under the (Open Government Licence)[https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/]. Attribution to SEPA is required, commercial use is allowed, see full license.", Some("Open Government Licence v3"), Some("https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/")),
            ("Data is not validated and is released by the authority under the Norwegian Licence for Open Government Data (NLOD).\nMore info [here](https://data.norge.no/nlod/en/)", Some("NLOD"), Some("https://data.norge.no/nlod/en/")),
            ("Data is not validated and is released by the authority under the license found at (this link)[https://danepubliczne.imgw.pl/regulations]", None, Some("https://danepubliczne.imgw.pl/regulations")),
            ("Data is not validated and is released by the authority under the license found at (this link)[https://www.bafu.admin.ch/dam/bafu/de/dokumente/hydrologie/fachinfo-daten/allgemeine_bedingungenfuerdasherunterladenaktuellerhydrologische.pdf.download.pdf/allgemeine_bedingungenfuerdasherunterladenaktuellerhydrologische.pdf]", None, Some("https://www.bafu.admin.ch/dam/bafu/de/dokumente/hydrologie/fachinfo-daten/allgemeine_bedingungenfuerdasherunterladenaktuellerhydrologische.pdf.download.pdf/allgemeine_bedingungenfuerdasherunterladenaktuellerhydrologische.pdf")),
            ("Data is not validated and is released by the authority under the licensing terms outlined at [this page](https://rhmzrs.com/uslovi-koriscenja).", None, Some("https://rhmzrs.com/uslovi-koriscenja")),
            ("Data is not validated and is released by the authority under the terms outlined (here)[http://spdiren.coliane.fr]", None, Some("http://spdiren.coliane.fr")),
            ("Data is not validated. Licensing terms are detailed [here](http://centrofunzionalebasilicata.it/it/disclaimer.php)", None, Some("http://centrofunzionalebasilicata.it/it/disclaimer.php")),
            ("Data is not validated. We are not aware of a formal license. Please publicly credit the station data and observations to the source organisation", None, None),
            ("Data is not validated. We are not aware of a formal license. Please publicly credit the station data and observations to the source organisation. More information is provided [here](https://hydrometrie.wallonie.be/mentions-legales.html) ", None, Some("https://hydrometrie.wallonie.be/mentions-legales.html")),
        ];
        for (terms, name, url) in corpus {
            let got = parse_license(terms);
            assert_eq!(got.name.as_deref(), *name, "name for: {terms:?}");
            assert_eq!(got.url.as_deref(), *url, "url for: {terms:?}");
        }
    }

    #[test]
    fn patterns_do_not_match_inside_words() {
        // "modello 2.0" contains "lo 2.0" as a substring; a word-boundary
        // check keeps it from being read as Licence Ouverte.
        let l = parse_license("released under the modello 2.0 framework");
        assert_eq!(l, License::default());
        // The real French string still matches.
        assert_eq!(named("released under (LO 2.0)[https://www.etalab.gouv.fr/x]").0, "Licence Ouverte 2.0");
    }

    #[test]
    fn a_bare_parenthetical_is_not_a_link() {
        // "(SHMU) in accordance with" has no bracket after the paren.
        let l = parse_license(
            "Data is provided by the authority (SHMU) in accordance with Act no. 211/2000 Coll. on free access to information",
        );
        assert_eq!(l, License::default());
    }
}
