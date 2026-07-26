/// Macro to define API documentation functions with automatic operation ID derivation.
#[macro_export]
macro_rules! doc_fn {
    ($name:ident, $op:ident => $body:expr) => {
        pub fn $name(
            $op: aide::transform::TransformOperation,
        ) -> aide::transform::TransformOperation {
            let operation_id = stringify!($name)
                .strip_suffix("_docs")
                .unwrap_or(stringify!($name));
            let $op = $op.id(operation_id);
            $body
        }
    };
}

pub mod error;
pub mod layers;
pub mod models;
pub mod query;
pub mod readers;
pub mod routes;
pub mod state;
