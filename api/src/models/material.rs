use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type MaterialId = i64;

/// Bounds on the free text and years of an entry; the migration repeats them
/// as check constraints.
pub const MAX_NAME_CHARS: usize = 80;
pub const MAX_SIZE_CHARS: usize = 40;
pub const MAX_DESCRIPTION_CHARS: usize = 4000;
pub const MAX_URL_CHARS: usize = 500;
pub const MIN_YEAR: i32 = 1900;
pub const MAX_YEAR: i32 = 2100;
pub const MAX_COLORS: usize = 40;
pub const MAX_COLOR_CHARS: usize = 80;
pub const MAX_NOTES_CHARS: usize = 4000;
pub const MAX_LENGTHS: usize = 20;
pub const MAX_FEATHERS: usize = 12;

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
    Paddle,
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
    Crossover,
    Freestyle,
    Other,
    Whitewater,
    Wildwater,
    Canoe,
    Polo,
}

impl MaterialDiscipline {
    /// Classes only a paddle can have; boats never use them.
    const PADDLE_ONLY: [Self; 4] = [Self::Whitewater, Self::Wildwater, Self::Canoe, Self::Polo];
    /// Paddles are grouped by use: these are all the classes a paddle may have.
    const PADDLE_CLASSES: [Self; 8] = [
        Self::Whitewater,
        Self::Freestyle,
        Self::Slalom,
        Self::Wildwater,
        Self::Touring,
        Self::Canoe,
        Self::Polo,
        Self::Other,
    ];

    /// Whether an entry of this category may be filed under the class. Mirrors
    /// chk_materials_discipline.
    pub fn fits(self, category: MaterialCategory) -> bool {
        if category == MaterialCategory::Paddle {
            Self::PADDLE_CLASSES.contains(&self)
        } else {
            !Self::PADDLE_ONLY.contains(&self)
        }
    }
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

/// How a paddle's shaft is shaped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "paddle_shaft", rename_all = "snake_case")]
pub enum PaddleShaft {
    Straight,
    Bent,
    Cranked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "paddle_shaft_material", rename_all = "snake_case")]
pub enum PaddleShaftMaterial {
    Carbon,
    Fiberglass,
    Aluminium,
    Wood,
    Plastic,
    Hybrid,
}

/// A mirrored product photo. Only fetched images are ever returned.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialImage {
    pub id: i64,
    /// The display copy, served from this API's media path.
    pub url: String,
    pub thumb_url: String,
    /// The page the photo came from, for the credit link.
    pub page_url: String,
    /// Whose photo it is (the maker).
    pub credit: String,
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
    /// Edition or build of the model ("PR-X", "1 piece, bent shaft"); absent
    /// when there is only one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    /// Size within the model ("M", "S/M", "8.5"); absent when it comes in one
    /// size only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
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
    /// Colourways as the maker names them.
    pub colors: Vec<String>,
    /// The years rest on a weak source: show "about <year>".
    pub year_approximate: bool,
    /// Field name to the page its value came from; imported entries only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sources: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blade_area_cm2: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blade_length_cm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blade_width_cm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub length_min_cm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub length_max_cm: Option<f64>,
    /// Sizes offered, for a paddle sold in fixed lengths.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lengths_cm: Option<Vec<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pieces: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shaft: Option<PaddleShaft>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shaft_material: Option<PaddleShaftMaterial>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blade_material: Option<String>,
    /// Feather angles offered, in degrees.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feather_deg: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shaft_diameter: Option<String>,
    /// Mirrored photos, fetched ones only.
    pub images: Vec<MaterialImage>,
    /// The other sizes of this entry's model, in size order.
    pub siblings: Vec<MaterialSibling>,
    pub created_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_by_username: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Another size of the same model.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialSibling {
    pub id: MaterialId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
}

/// One size of a model in the models list.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ModelSize {
    pub id: MaterialId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub length_cm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight_kg: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume_l: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paddler_weight_min_kg: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paddler_weight_max_kg: Option<f64>,
    /// Sizes offered, for a paddle sold in fixed lengths.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lengths_cm: Option<Vec<f64>>,
}

/// A model: the entries that share category, brand, model and variant, one
/// per size.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialModel {
    pub category: MaterialCategory,
    pub brand: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discipline: Option<MaterialDiscipline>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub construction: Option<MaterialConstruction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year_from: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year_to: Option<i32>,
    pub year_approximate: bool,
    /// Thumbnail of the first fetched photo of any size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumb_url: Option<String>,
    /// The sizes that match the filters, XS to XL and then by number.
    pub sizes: Vec<ModelSize>,
}

/// A brand with the number of entries filed under it, for the brand filter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialBrand {
    pub brand: String,
    pub count: i64,
}

/// The writable fields of an entry. A PUT replaces all of them, so create and
/// update take the same body. A proposal stores it as its `proposed_data`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialBody {
    pub category: MaterialCategory,
    pub brand: String,
    pub model: String,
    pub variant: Option<String>,
    pub size: Option<String>,
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
    #[serde(default)]
    pub colors: Vec<String>,
    #[serde(default)]
    pub year_approximate: bool,
    pub notes: Option<String>,
    pub blade_area_cm2: Option<f64>,
    pub blade_length_cm: Option<f64>,
    pub blade_width_cm: Option<f64>,
    pub length_min_cm: Option<f64>,
    pub length_max_cm: Option<f64>,
    pub lengths_cm: Option<Vec<f64>>,
    pub pieces: Option<i32>,
    pub shaft: Option<PaddleShaft>,
    pub shaft_material: Option<PaddleShaftMaterial>,
    pub blade_material: Option<String>,
    pub feather_deg: Option<Vec<i32>>,
    pub shaft_diameter: Option<String>,
}

/// How a material list is ordered. Name is the default. Newest is the model
/// year, newest first; Added is when the entry was filed in the wiki. The
/// measurement sorts order a model by its smallest size. Entries and models
/// that lack the year or measurement come last either way.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum MaterialSort {
    #[default]
    Name,
    Newest,
    Added,
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

impl From<&Material> for MaterialBody {
    /// The writable fields of an entry, as a proposal's `original_data`
    /// shows them next to the `proposed_data`.
    fn from(m: &Material) -> Self {
        MaterialBody {
            category: m.category,
            brand: m.brand.clone(),
            model: m.model.clone(),
            variant: m.variant.clone(),
            size: m.size.clone(),
            discipline: m.discipline,
            construction: m.construction,
            description: m.description.clone(),
            year_from: m.year_from,
            year_to: m.year_to,
            length_cm: m.length_cm,
            width_cm: m.width_cm,
            height_cm: m.height_cm,
            volume_l: m.volume_l,
            weight_kg: m.weight_kg,
            cockpit_length_cm: m.cockpit_length_cm,
            cockpit_width_cm: m.cockpit_width_cm,
            paddler_weight_min_kg: m.paddler_weight_min_kg,
            paddler_weight_max_kg: m.paddler_weight_max_kg,
            product_url: m.product_url.clone(),
            colors: m.colors.clone(),
            year_approximate: m.year_approximate,
            notes: m.notes.clone(),
            blade_area_cm2: m.blade_area_cm2,
            blade_length_cm: m.blade_length_cm,
            blade_width_cm: m.blade_width_cm,
            length_min_cm: m.length_min_cm,
            length_max_cm: m.length_max_cm,
            lengths_cm: m.lengths_cm.clone(),
            pieces: m.pieces,
            shaft: m.shaft,
            shaft_material: m.shaft_material,
            blade_material: m.blade_material.clone(),
            feather_deg: m.feather_deg.clone(),
            shaft_diameter: m.shaft_diameter.clone(),
        }
    }
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
        clean(&mut self.size);
        clean(&mut self.description);
        clean(&mut self.product_url);
        clean(&mut self.notes);
        clean(&mut self.blade_material);
        clean(&mut self.shaft_diameter);
        let mut colors: Vec<String> = Vec::new();
        for color in self.colors.drain(..) {
            let color = color.trim().to_owned();
            if !color.is_empty() && !colors.contains(&color) {
                colors.push(color);
            }
        }
        self.colors = colors;
        // An empty list says nothing; store it as absent.
        if self.lengths_cm.as_ref().is_some_and(Vec::is_empty) {
            self.lengths_cm = None;
        }
        if self.feather_deg.as_ref().is_some_and(Vec::is_empty) {
            self.feather_deg = None;
        }
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
        let texts: [(&'static str, Option<&str>, usize); 6] = [
            ("brand", Some(&self.brand), MAX_NAME_CHARS),
            ("model", Some(&self.model), MAX_NAME_CHARS),
            ("variant", self.variant.as_deref(), MAX_NAME_CHARS),
            ("size", self.size.as_deref(), MAX_SIZE_CHARS),
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
        if let Some(err) = self.extras_error() {
            return Some(err);
        }
        if self.discipline.is_some_and(|d| !d.fits(self.category)) {
            return Some(("discipline", "This class does not fit the category".into()));
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

    /// The rules for the colours, notes and paddle fields. Paddle fields on
    /// anything but a paddle are refused, so a boat never carries blade data.
    fn extras_error(&self) -> Option<(&'static str, String)> {
        let texts: [(&'static str, Option<&str>, usize); 3] = [
            ("notes", self.notes.as_deref(), MAX_NOTES_CHARS),
            (
                "blade_material",
                self.blade_material.as_deref(),
                MAX_NAME_CHARS,
            ),
            ("shaft_diameter", self.shaft_diameter.as_deref(), 40),
        ];
        for (field, value, max) in texts {
            if value.is_some_and(|v| v.chars().count() > max) {
                return Some((field, format!("{field} is longer than {max} characters")));
            }
        }
        if self.colors.len() > MAX_COLORS
            || self
                .colors
                .iter()
                .any(|c| c.chars().count() > MAX_COLOR_CHARS)
        {
            return Some((
                "colors",
                format!("At most {MAX_COLORS} colors of {MAX_COLOR_CHARS} characters each"),
            ));
        }
        let has_paddle_data = self.blade_area_cm2.is_some()
            || self.blade_length_cm.is_some()
            || self.blade_width_cm.is_some()
            || self.length_min_cm.is_some()
            || self.length_max_cm.is_some()
            || self.lengths_cm.is_some()
            || self.pieces.is_some()
            || self.shaft.is_some()
            || self.shaft_material.is_some()
            || self.blade_material.is_some()
            || self.feather_deg.is_some()
            || self.shaft_diameter.is_some();
        if has_paddle_data && self.category != MaterialCategory::Paddle {
            return Some((
                "category",
                "Blade and shaft fields belong to paddles".into(),
            ));
        }
        let sizes: [(&'static str, Option<f64>, f64); 5] = [
            ("blade_area_cm2", self.blade_area_cm2, 2000.0),
            ("blade_length_cm", self.blade_length_cm, 200.0),
            ("blade_width_cm", self.blade_width_cm, 200.0),
            ("length_min_cm", self.length_min_cm, 400.0),
            ("length_max_cm", self.length_max_cm, 400.0),
        ];
        for (field, value, ceiling) in sizes {
            if value.is_some_and(|v| !v.is_finite() || v <= 0.0 || v > ceiling) {
                return Some((
                    field,
                    format!("{field} must be greater than zero and at most {ceiling}"),
                ));
            }
        }
        if let (Some(min), Some(max)) = (self.length_min_cm, self.length_max_cm)
            && max < min
        {
            return Some((
                "length_max_cm",
                "Longest length is below the shortest".into(),
            ));
        }
        if self.pieces.is_some_and(|p| !(1..=8).contains(&p)) {
            return Some(("pieces", "pieces must be 1 to 8".into()));
        }
        if let Some(lengths) = &self.lengths_cm
            && (lengths.len() > MAX_LENGTHS
                || lengths
                    .iter()
                    .any(|v| !v.is_finite() || *v <= 0.0 || *v > 400.0))
        {
            return Some((
                "lengths_cm",
                format!("At most {MAX_LENGTHS} lengths, each above zero and at most 400"),
            ));
        }
        if let Some(feather) = &self.feather_deg
            && (feather.len() > MAX_FEATHERS || feather.iter().any(|v| !(0..=360).contains(v)))
        {
            return Some((
                "feather_deg",
                format!("At most {MAX_FEATHERS} angles, each 0 to 360"),
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
            size: None,
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
            colors: vec![],
            year_approximate: false,
            notes: None,
            blade_area_cm2: None,
            blade_length_cm: None,
            blade_width_cm: None,
            length_min_cm: None,
            length_max_cm: None,
            lengths_cm: None,
            pieces: None,
            shaft: None,
            shaft_material: None,
            blade_material: None,
            feather_deg: None,
            shaft_diameter: None,
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
    fn paddle_fields_belong_to_paddles() {
        let mut b = body();
        b.blade_area_cm2 = Some(700.0);
        assert_eq!(b.validation_error().map(|(f, _)| f), Some("category"));
        b.category = MaterialCategory::Paddle;
        assert!(b.validation_error().is_none());
    }

    #[test]
    fn a_class_must_fit_the_category() {
        let mut b = body();
        b.category = MaterialCategory::Paddle;
        for d in MaterialDiscipline::PADDLE_CLASSES {
            b.discipline = Some(d);
            assert!(b.validation_error().is_none(), "{d:?}");
        }
        for d in [MaterialDiscipline::Creek, MaterialDiscipline::Playboat] {
            b.discipline = Some(d);
            assert_eq!(b.validation_error().map(|(f, _)| f), Some("discipline"));
        }
        b.category = MaterialCategory::Kayak;
        for d in MaterialDiscipline::PADDLE_ONLY {
            b.discipline = Some(d);
            assert_eq!(b.validation_error().map(|(f, _)| f), Some("discipline"));
        }
        b.discipline = Some(MaterialDiscipline::Creek);
        assert!(b.validation_error().is_none());
    }

    #[test]
    fn extras_are_bounded() {
        let mut paddle = body();
        paddle.category = MaterialCategory::Paddle;
        type Apply = Box<dyn Fn(&mut MaterialBody)>;
        let cases: Vec<(&str, Apply)> = vec![
            (
                "colors",
                Box::new(|b| b.colors = vec!["x".into(); MAX_COLORS + 1]),
            ),
            (
                "notes",
                Box::new(|b| b.notes = Some("x".repeat(MAX_NOTES_CHARS + 1))),
            ),
            ("blade_area_cm2", Box::new(|b| b.blade_area_cm2 = Some(1e6))),
            ("pieces", Box::new(|b| b.pieces = Some(0))),
            (
                "lengths_cm",
                Box::new(|b| b.lengths_cm = Some(vec![f64::NAN])),
            ),
            ("feather_deg", Box::new(|b| b.feather_deg = Some(vec![400]))),
            (
                "length_max_cm",
                Box::new(|b| {
                    b.length_min_cm = Some(200.0);
                    b.length_max_cm = Some(190.0);
                }),
            ),
        ];
        for (field, apply) in cases {
            let mut b = paddle.clone();
            apply(&mut b);
            assert_eq!(b.validation_error().map(|(f, _)| f), Some(field), "{field}");
        }
    }

    #[test]
    fn normalizing_dedupes_colors() {
        let mut b = body();
        b.colors = vec![" Red ".into(), "Red".into(), " ".into(), "Blue".into()];
        b.normalize();
        assert_eq!(b.colors, vec!["Red", "Blue"]);
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

/// A brand inside one discipline of the browse tree.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialTreeBrand {
    pub brand: String,
    /// Models of the brand that match the filters.
    pub models: i64,
    /// Entries (sizes) of those models.
    pub entries: i64,
}

/// A discipline inside one category of the browse tree.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialTreeDiscipline {
    pub discipline: MaterialDiscipline,
    pub models: i64,
    pub entries: i64,
    /// Most models first.
    pub brands: Vec<MaterialTreeBrand>,
}

/// A category of the browse tree. Entries without a discipline count toward
/// the category but sit under no discipline.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialTreeCategory {
    pub category: MaterialCategory,
    pub models: i64,
    pub entries: i64,
    /// Most models first.
    pub disciplines: Vec<MaterialTreeDiscipline>,
}

/// The wiki as a browse tree: category, discipline, brand.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MaterialTree {
    pub categories: Vec<MaterialTreeCategory>,
}
