use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type MaterialId = i64;

/// Bounds on the free text and years of an entry; the migration repeats them
/// as check constraints.
pub const MAX_NAME_CHARS: usize = 80;
pub const MAX_DESCRIPTION_CHARS: usize = 4000;
pub const MAX_URL_CHARS: usize = 500;
pub const MIN_YEAR: i32 = 1900;
pub const MAX_YEAR: i32 = 2100;

/// Longest search text or brand filter the list takes.
pub const MAX_QUERY_CHARS: usize = 100;

/// What kind of gear an entry is. Every category is a boat for now, so they
/// all carry the same hull specs; a category with a different spec set gets
/// its own table rather than more optional fields here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "material_category", rename_all = "snake_case")]
pub enum MaterialCategory {
    Kayak,
    Canoe,
    Packraft,
    Sup,
}

/// What the boat is built for. This is the peer group of a comparison - two
/// creekers compare, a creeker and a sea kayak do not.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "material_discipline", rename_all = "snake_case")]
pub enum MaterialDiscipline {
    Creek,
    RiverRunner,
    HalfSlice,
    Playboat,
    Slalom,
    Downriver,
    Touring,
    Sea,
    Expedition,
    Recreational,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "material_construction", rename_all = "snake_case")]
pub enum MaterialConstruction {
    Plastic,
    Composite,
    Inflatable,
    Folding,
    Wood,
}

/// One entry in the material wiki. The measurements are flat and each names
/// its unit, so a comparison reads them straight off two entries without
/// converting anything.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Material {
    pub id: MaterialId,
    pub category: MaterialCategory,
    pub brand: String,
    pub model: String,
    /// Size or trim of the same model ("M", "Large"); absent when the model
    /// comes in one size only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discipline: Option<MaterialDiscipline>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub construction: Option<MaterialConstruction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// First and last model year, both open ended - a boat still in
    /// production has no `year_to`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year_from: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year_to: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub length_cm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width_cm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height_cm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume_l: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight_kg: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cockpit_length_cm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cockpit_width_cm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paddler_weight_min_kg: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paddler_weight_max_kg: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product_url: Option<String>,
    pub created_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_by_username: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A brand with the number of entries filed under it, for the brand filter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialBrand {
    pub brand: String,
    pub count: i64,
}

/// The writable fields of an entry. A PUT replaces all of them, so create and
/// update take the same body.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct MaterialBody {
    pub category: MaterialCategory,
    pub brand: String,
    pub model: String,
    pub variant: Option<String>,
    pub discipline: Option<MaterialDiscipline>,
    pub construction: Option<MaterialConstruction>,
    pub description: Option<String>,
    pub year_from: Option<i32>,
    pub year_to: Option<i32>,
    pub length_cm: Option<f64>,
    pub width_cm: Option<f64>,
    pub height_cm: Option<f64>,
    pub volume_l: Option<f64>,
    pub weight_kg: Option<f64>,
    pub cockpit_length_cm: Option<f64>,
    pub cockpit_width_cm: Option<f64>,
    pub paddler_weight_min_kg: Option<f64>,
    pub paddler_weight_max_kg: Option<f64>,
    pub product_url: Option<String>,
}

/// How a material list is ordered. Name is the default; the measurement sorts
/// put the entries missing that measurement last either way.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MaterialSort {
    #[default]
    Name,
    Newest,
    Length,
    Volume,
    Weight,
}

/// Query parameters of the material search. Every measurement filter is a
/// half-open bound, so a list can be narrowed from one side only.
#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct MaterialFilters {
    /// Page number, starting at 1.
    pub page: Option<i64>,
    /// Items per page (max 100, default 24).
    pub per_page: Option<i64>,
    /// Filter by brand or model, diacritic- and typo-tolerant.
    pub q: Option<String>,
    /// Comma separated ids - what the comparison view asks for. Overrides
    /// every other filter and returns those entries in one page.
    pub ids: Option<String>,
    pub category: Option<MaterialCategory>,
    pub discipline: Option<MaterialDiscipline>,
    pub construction: Option<MaterialConstruction>,
    /// Exact brand, case-insensitive.
    pub brand: Option<String>,
    pub min_length_cm: Option<f64>,
    pub max_length_cm: Option<f64>,
    pub min_volume_l: Option<f64>,
    pub max_volume_l: Option<f64>,
    pub min_weight_kg: Option<f64>,
    pub max_weight_kg: Option<f64>,
    /// Body weight in kg - keeps the boats whose paddler range covers it. An
    /// entry that states no range is kept, since it contradicts nothing.
    pub fits_paddler_kg: Option<f64>,
    #[serde(default)]
    pub sort: MaterialSort,
}

impl MaterialBody {
    /// Trim the free text and drop what is left empty, so a blank field is
    /// stored as NULL rather than as an empty string.
    pub fn normalize(&mut self) {
        fn clean(value: &mut Option<String>) {
            *value = value
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned);
        }
        self.brand = self.brand.trim().to_owned();
        self.model = self.model.trim().to_owned();
        clean(&mut self.variant);
        clean(&mut self.description);
        clean(&mut self.product_url);
    }

    /// The reason the body cannot be stored, as a field name and a message,
    /// or None when it is sound. The database enforces the same bounds; this
    /// reports them as a 400 naming the field rather than as an opaque
    /// constraint failure.
    pub fn validation_error(&self) -> Option<(&'static str, String)> {
        if self.brand.is_empty() {
            return Some(("brand", "Brand is required".into()));
        }
        if self.model.is_empty() {
            return Some(("model", "Model is required".into()));
        }
        let texts: [(&'static str, Option<&str>, usize); 5] = [
            ("brand", Some(&self.brand), MAX_NAME_CHARS),
            ("model", Some(&self.model), MAX_NAME_CHARS),
            ("variant", self.variant.as_deref(), MAX_NAME_CHARS),
            (
                "description",
                self.description.as_deref(),
                MAX_DESCRIPTION_CHARS,
            ),
            ("product_url", self.product_url.as_deref(), MAX_URL_CHARS),
        ];
        for (field, value, max) in texts {
            if value.is_some_and(|v| v.chars().count() > max) {
                return Some((field, format!("{field} is longer than {max} characters")));
            }
        }
        for (field, year) in [("year_from", self.year_from), ("year_to", self.year_to)] {
            if year.is_some_and(|y| !(MIN_YEAR..=MAX_YEAR).contains(&y)) {
                return Some((field, format!("{field} must be {MIN_YEAR} to {MAX_YEAR}")));
            }
        }
        if let (Some(from), Some(to)) = (self.year_from, self.year_to)
            && to < from
        {
            return Some(("year_to", "Last year is before the first year".into()));
        }
        if let (Some(min), Some(max)) = (self.paddler_weight_min_kg, self.paddler_weight_max_kg)
            && max < min
        {
            return Some((
                "paddler_weight_max_kg",
                "Maximum paddler weight is below the minimum".into(),
            ));
        }
        for (field, value, ceiling) in self.measurements() {
            if value.is_some_and(|v| !v.is_finite() || v <= 0.0 || v > ceiling) {
                return Some((
                    field,
                    format!("{field} must be greater than zero and at most {ceiling}"),
                ));
            }
        }
        if let Some(url) = self.product_url.as_deref()
            && !(url.starts_with("http://") || url.starts_with("https://"))
        {
            return Some((
                "product_url",
                "Link must start with http:// or https://".into(),
            ));
        }
        None
    }

    /// Each measurement with its field name and the largest value accepted.
    fn measurements(&self) -> [(&'static str, Option<f64>, f64); 9] {
        [
            ("length_cm", self.length_cm, 2000.0),
            ("width_cm", self.width_cm, 500.0),
            ("height_cm", self.height_cm, 500.0),
            ("volume_l", self.volume_l, 2000.0),
            ("weight_kg", self.weight_kg, 500.0),
            ("cockpit_length_cm", self.cockpit_length_cm, 500.0),
            ("cockpit_width_cm", self.cockpit_width_cm, 500.0),
            ("paddler_weight_min_kg", self.paddler_weight_min_kg, 500.0),
            ("paddler_weight_max_kg", self.paddler_weight_max_kg, 500.0),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn body() -> MaterialBody {
        MaterialBody {
            category: MaterialCategory::Kayak,
            brand: "Pyranha".into(),
            model: "Firecracker".into(),
            variant: None,
            discipline: None,
            construction: None,
            description: None,
            year_from: None,
            year_to: None,
            length_cm: None,
            width_cm: None,
            height_cm: None,
            volume_l: None,
            weight_kg: None,
            cockpit_length_cm: None,
            cockpit_width_cm: None,
            paddler_weight_min_kg: None,
            paddler_weight_max_kg: None,
            product_url: None,
        }
    }

    #[test]
    fn a_named_entry_passes() {
        assert!(body().validation_error().is_none());
    }

    #[test]
    fn normalizing_empties_a_blank_field() {
        let mut b = body();
        b.brand = "  Pyranha ".into();
        b.variant = Some("   ".into());
        b.normalize();
        assert_eq!(b.brand, "Pyranha");
        assert_eq!(b.variant, None);
    }

    #[test]
    fn a_name_is_required() {
        let mut b = body();
        b.brand = " ".into();
        b.normalize();
        assert_eq!(b.validation_error().map(|(field, _)| field), Some("brand"));
    }

    #[test]
    fn ranges_run_forwards() {
        let mut years = body();
        years.year_from = Some(2020);
        years.year_to = Some(2018);
        assert_eq!(
            years.validation_error().map(|(field, _)| field),
            Some("year_to")
        );

        let mut weights = body();
        weights.paddler_weight_min_kg = Some(90.0);
        weights.paddler_weight_max_kg = Some(60.0);
        assert_eq!(
            weights.validation_error().map(|(field, _)| field),
            Some("paddler_weight_max_kg")
        );
    }

    #[test]
    fn a_measurement_is_positive() {
        let mut b = body();
        b.volume_l = Some(0.0);
        assert_eq!(
            b.validation_error().map(|(field, _)| field),
            Some("volume_l")
        );
    }

    #[test]
    fn text_and_numbers_have_ceilings() {
        let mut long = body();
        long.model = "x".repeat(MAX_NAME_CHARS + 1);
        assert_eq!(long.validation_error().map(|(f, _)| f), Some("model"));

        let mut huge = body();
        huge.weight_kg = Some(1e9);
        assert_eq!(huge.validation_error().map(|(f, _)| f), Some("weight_kg"));

        let mut nan = body();
        nan.length_cm = Some(f64::NAN);
        assert_eq!(nan.validation_error().map(|(f, _)| f), Some("length_cm"));

        let mut year = body();
        year.year_from = Some(1066);
        assert_eq!(year.validation_error().map(|(f, _)| f), Some("year_from"));
    }

    #[test]
    fn a_link_is_a_web_link() {
        let mut b = body();
        b.product_url = Some("pyranha.com".into());
        assert_eq!(
            b.validation_error().map(|(field, _)| field),
            Some("product_url")
        );
    }
}
