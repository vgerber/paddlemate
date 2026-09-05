//! Query-parameter parsing shared by the geographic lookup routes.

use crate::error::ApiError;

/// Longest accepted line, in points.
const MAX_LINE_POINTS: usize = 50;

/// Parse a "lon,lat;lon,lat;..." line parameter into coordinate pairs.
pub fn parse_line(raw: &str) -> Result<Vec<(f64, f64)>, ApiError> {
    let points: Option<Vec<(f64, f64)>> = raw
        .split(';')
        .map(|pair| {
            let (lon, lat) = pair.split_once(',')?;
            let lon: f64 = lon.trim().parse().ok()?;
            let lat: f64 = lat.trim().parse().ok()?;
            ((-180.0..=180.0).contains(&lon) && (-90.0..=90.0).contains(&lat)).then_some((lon, lat))
        })
        .collect();
    match points {
        Some(points) if !points.is_empty() && points.len() <= MAX_LINE_POINTS => Ok(points),
        _ => Err(
            ApiError::validation("line must be 1-50 'lon,lat' pairs separated by ';'")
                .with_target("line"),
        ),
    }
}

/// Parse a "south,west,north,east" bbox parameter, rejecting inverted or
/// out-of-range bounds.
pub fn parse_bbox(raw: &str) -> Option<(f64, f64, f64, f64)> {
    let parts: Vec<f64> = raw
        .split(',')
        .map(|p| p.trim().parse().ok())
        .collect::<Option<_>>()?;
    match parts[..] {
        [south, west, north, east]
            if south < north
                && west < east
                && (-90.0..=90.0).contains(&south)
                && (-90.0..=90.0).contains(&north)
                && (-180.0..=180.0).contains(&west)
                && (-180.0..=180.0).contains(&east) =>
        {
            Some((south, west, north, east))
        }
        _ => None,
    }
}

/// Build a GeoJSON LineString from parsed coordinate pairs.
pub fn line_string(points: &[(f64, f64)]) -> serde_json::Value {
    let coordinates: Vec<serde_json::Value> = points
        .iter()
        .map(|(lon, lat)| serde_json::json!([lon, lat]))
        .collect();
    serde_json::json!({ "type": "LineString", "coordinates": coordinates })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_line_pairs() {
        assert_eq!(
            parse_line("11.1,47.2;11.3,47.4").expect("parses"),
            vec![(11.1, 47.2), (11.3, 47.4)]
        );
        assert!(parse_line("").is_err());
        assert!(parse_line("11.1;47.2").is_err());
        assert!(parse_line("200,47").is_err());
        assert!(parse_line(&vec!["1,1"; 51].join(";")).is_err());
    }

    #[test]
    fn builds_line_string() {
        let line = line_string(&[(11.1, 47.2), (11.3, 47.4)]);
        assert_eq!(line["type"], "LineString");
        assert_eq!(line["coordinates"][0][0], 11.1);
        assert_eq!(line["coordinates"][1][1], 47.4);
    }
}
