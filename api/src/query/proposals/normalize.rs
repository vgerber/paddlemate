use crate::models::{
    feature::CreateFeatureBody,
    lang::{DEFAULT_LANG_CODE, normalize_lang_code},
    water_section::CreateSectionBody,
};

/// Proposals submitted before language tags were normalized at the API
/// boundary still hold whatever the client sent. Approving one must not fail on
/// that, so the tag is normalized here and an unusable one falls back to the
/// default rather than blocking the reviewer.
pub(super) fn normalize_stored_feature_lang_code(body: &mut CreateFeatureBody, proposal_id: i64) {
    if body.normalize_lang_code().is_err() {
        tracing::warn!(
            "Proposal {} carries an invalid lang_code {:?}; storing it as {}",
            proposal_id,
            body.lang_code,
            DEFAULT_LANG_CODE
        );
        body.lang_code = Some(DEFAULT_LANG_CODE.to_string());
    }
}

/// Same for a section bundle, covering its translations and bundled features.
pub(super) fn normalize_stored_lang_codes(body: &mut CreateSectionBody, proposal_id: i64) {
    for translation in &mut body.translations {
        if let Ok(code) = normalize_lang_code(&translation.lang_code) {
            translation.lang_code = code;
        } else {
            tracing::warn!(
                "Proposal {} carries an invalid lang_code {:?}; storing it as {}",
                proposal_id,
                translation.lang_code,
                DEFAULT_LANG_CODE
            );
            translation.lang_code = DEFAULT_LANG_CODE.to_string();
        }
    }
    for feature in &mut body.features {
        normalize_stored_feature_lang_code(feature, proposal_id);
    }
}
