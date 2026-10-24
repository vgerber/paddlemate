//! River order of a waterway's sections, upstream to downstream.
//!
//! `river_km_start` is only set on some sections, so it cannot be the sort
//! key. A section line runs put-in to take-out, so a section follows the ones
//! whose take-out lies at its put-in; the number of sections upstream of it
//! is its position.

use crate::models::geometry::Geometry;

/// Put-in and take-out closer than this (metres) belong to one chain.
const JOIN_M: f64 = 200.0;

/// What the order needs from a section.
pub struct Span {
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub km: Option<f64>,
    pub name: String,
}

impl Span {
    /// None when the geometry is not a line with two or more points.
    pub fn new(location: &Geometry, km: Option<f64>, name: &str) -> Option<Span> {
        let Geometry::LineString { coordinates } = location else {
            return None;
        };
        Some(Span {
            start: *coordinates.first()?,
            end: *coordinates.last()?,
            km,
            name: name.to_owned(),
        })
    }
}

fn metres(a: [f64; 2], b: [f64; 2]) -> f64 {
    let dx = (a[0] - b[0]) * a[1].to_radians().cos();
    let dy = a[1] - b[1];
    (dx * dx + dy * dy).sqrt() * 111_320.0
}

fn by_km_then_name(a: &Span, b: &Span) -> std::cmp::Ordering {
    let km = |s: &Span| s.km.unwrap_or(f64::INFINITY);
    km(a).total_cmp(&km(b)).then_with(|| a.name.cmp(&b.name))
}

/// Indices of the spans in river order. Spans without a usable line (None)
/// come last, by index.
pub fn river_order(spans: &[Option<Span>]) -> Vec<usize> {
    let known: Vec<(usize, &Span)> = spans
        .iter()
        .enumerate()
        .filter_map(|(i, s)| s.as_ref().map(|s| (i, s)))
        .collect();
    let all_km = known.iter().all(|(_, s)| s.km.is_some());
    let mut keyed: Vec<(usize, usize, &Span)> = known
        .iter()
        .map(|&(i, s)| (i, if all_km { 0 } else { upstream_count(&known, s) }, s))
        .collect();
    keyed.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| by_km_then_name(a.2, b.2)));
    let mut order: Vec<usize> = keyed.into_iter().map(|k| k.0).collect();
    order.extend(
        spans
            .iter()
            .enumerate()
            .filter(|(_, s)| s.is_none())
            .map(|(i, _)| i),
    );
    order
}

/// Sections reachable by walking take-out to put-in links from `target`.
fn upstream_count(known: &[(usize, &Span)], target: &Span) -> usize {
    let mut seen = vec![false; known.len()];
    let mut stack = vec![target.start];
    let mut count = 0;
    while let Some(put_in) = stack.pop() {
        for (n, (_, s)) in known.iter().enumerate() {
            if !seen[n] && !std::ptr::eq(*s, target) && metres(s.end, put_in) <= JOIN_M {
                seen[n] = true;
                count += 1;
                stack.push(s.start);
            }
        }
    }
    count
}

/// Reorder `items` along the river; `span` reads a section's line.
pub fn sort_along_river<T>(items: Vec<T>, span: impl Fn(&T) -> Option<Span>) -> Vec<T> {
    let spans: Vec<Option<Span>> = items.iter().map(&span).collect();
    let mut slots: Vec<Option<T>> = items.into_iter().map(Some).collect();
    river_order(&spans)
        .into_iter()
        .filter_map(|i| slots[i].take())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span(start: [f64; 2], end: [f64; 2], km: Option<f64>, name: &str) -> Option<Span> {
        Some(Span {
            start,
            end,
            km,
            name: name.into(),
        })
    }

    #[test]
    fn chains_without_km() {
        let spans = vec![
            span([13.6, 46.2], [13.7, 46.1], None, "C"),
            span([13.4, 46.4], [13.5, 46.3], None, "A"),
            span([13.5, 46.3], [13.6, 46.2], None, "B"),
        ];
        assert_eq!(river_order(&spans), vec![1, 2, 0]);
    }

    #[test]
    fn km_wins_when_all_set() {
        let spans = vec![
            span([0.0, 0.0], [0.0, 0.1], Some(9.0), "A"),
            span([0.0, 0.1], [0.0, 0.2], Some(1.0), "B"),
        ];
        assert_eq!(river_order(&spans), vec![1, 0]);
    }

    #[test]
    fn unlocated_last() {
        let spans = vec![None, span([0.0, 0.0], [0.0, 0.1], None, "A")];
        assert_eq!(river_order(&spans), vec![1, 0]);
    }
}
