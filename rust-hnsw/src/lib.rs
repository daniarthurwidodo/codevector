use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

/// HNSW parameters
#[wasm_bindgen]
#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct HNSWParams {
    pub m: usize,
    pub ef_construction: usize,
    pub ef_search: usize,
}

impl Default for HNSWParams {
    fn default() -> Self {
        HNSWParams {
            m: 16,
            ef_construction: 200,
            ef_search: 64,
        }
    }
}

/// A single point in the HNSW graph
#[derive(Clone, Serialize, Deserialize)]
struct Point {
    id: String,
    vector: Vec<f32>,
    level: usize,
}

/// Layer in the HNSW graph
#[derive(Clone, Serialize, Deserialize)]
struct Layer {
    links: HashMap<String, Vec<String>>,
}

/// HNSW Vector Index
#[wasm_bindgen]
#[derive(Serialize, Deserialize)]
pub struct HNSWIndex {
    params: HNSWParams,
    points: HashMap<String, Point>,
    layers: Vec<Layer>,
    entry_point: Option<String>,
    dimensions: usize,
}

#[wasm_bindgen]
impl HNSWIndex {
    /// Create a new HNSW index
    #[wasm_bindgen(constructor)]
    pub fn new(params: JsValue) -> Result<HNSWIndex, JsValue> {
        let params: HNSWParams = if params.is_undefined() {
            HNSWParams::default()
        } else {
            serde_wasm_bindgen::from_value(params)
                .map_err(|e| JsValue::from_str(&format!("Invalid params: {}", e)))?
        };

        Ok(HNSWIndex {
            params,
            points: HashMap::new(),
            layers: Vec::new(),
            entry_point: None,
            dimensions: 0,
        })
    }

    /// Add a vector to the index
    pub fn add(&mut self, id: String, vector: Vec<f32>) -> Result<(), JsValue> {
        if self.dimensions == 0 {
            self.dimensions = vector.len();
        } else if vector.len() != self.dimensions {
            return Err(JsValue::from_str(&format!(
                "Vector dimension mismatch: expected {}, got {}",
                self.dimensions,
                vector.len()
            )));
        }

        let level = self.random_level();
        let point = Point {
            id: id.clone(),
            vector,
            level,
        };

        self.points.insert(id.clone(), point);

        // Ensure enough layers exist
        while self.layers.len() <= level {
            self.layers.push(Layer {
                links: HashMap::new(),
            });
        }

        // Insert into layers
        for layer_idx in 0..=level {
            let layer = &mut self.layers[layer_idx];
            layer.links.entry(id.clone()).or_insert_with(Vec::new);
        }

        // Update entry point
        if self.entry_point.is_none() || level > self.get_entry_level() {
            self.entry_point = Some(id);
        }

        Ok(())
    }

    /// Search for nearest neighbors
    pub fn search(&self, vector: Vec<f32>, k: usize) -> Result<JsValue, JsValue> {
        if vector.len() != self.dimensions {
            return Err(JsValue::from_str("Vector dimension mismatch"));
        }

        let ef = self.params.ef_search.max(k);
        let candidates = self.search_layer(&vector, ef, 0);

        // Get top k results
        let mut results: Vec<(String, f32)> = candidates
            .into_iter()
            .filter_map(|(id, dist)| {
                self.points.get(&id).map(|_| (id, 1.0 - dist)) // Convert to similarity
            })
            .collect();

        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(k);

        // Convert to JavaScript array
        let results_js: Vec<JsValue> = results
            .into_iter()
            .map(|(id, score)| {
                let obj = js_sys::Object::new();
                js_sys::Reflect::set(&obj, &JsValue::from_str("id"), &JsValue::from_str(&id))
                    .unwrap();
                js_sys::Reflect::set(&obj, &JsValue::from_str("score"), &JsValue::from_f64(score as f64))
                    .unwrap();
                JsValue::from(obj)
            })
            .collect();

        Ok(serde_wasm_bindgen::to_value(&results_js)?)
    }

    /// Delete a vector from the index
    pub fn delete(&mut self, id: &str) -> Result<(), JsValue> {
        self.points.remove(id);

        // Remove from all layers
        for layer in &mut self.layers {
            layer.links.remove(id);

            // Remove links to this point from other points
            for links in layer.links.values_mut() {
                links.retain(|link_id| link_id != id);
            }
        }

        // Update entry point if needed
        if self.entry_point.as_ref() == Some(&id.to_string()) {
            self.entry_point = self.points.keys().next().cloned();
        }

        Ok(())
    }

    /// Save the index to bytes
    pub fn save(&self) -> Result<Vec<u8>, JsValue> {
        let json = serde_json::to_vec(self)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?;
        Ok(json)
    }

    /// Load the index from bytes
    pub fn load(&mut self, data: &[u8]) -> Result<(), JsValue> {
        let loaded: HNSWIndex = serde_json::from_slice(data)
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

        *self = loaded;
        Ok(())
    }

    /// Get index statistics
    pub fn get_stats(&self) -> JsValue {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(
            &obj,
            &JsValue::from_str("totalVectors"),
            &JsValue::from_f64(self.points.len() as f64),
        )
        .unwrap();
        js_sys::Reflect::set(
            &obj,
            &JsValue::from_str("dimensions"),
            &JsValue::from_f64(self.dimensions as f64),
        )
        .unwrap();
        js_sys::Reflect::set(
            &obj,
            &JsValue::from_str("indexSize"),
            &JsValue::from_f64((self.points.len() * self.dimensions * 4) as f64),
        )
        .unwrap();
        JsValue::from(obj)
    }

    /// Clear the index
    pub fn clear(&mut self) {
        self.points.clear();
        self.layers.clear();
        self.entry_point = None;
        self.dimensions = 0;
    }
}

impl HNSWIndex {
    /// Generate random level for new point
    fn random_level(&self) -> usize {
        let mut level = 0;
        let m = self.params.m as f32;
        while rand::random::<f32>() < 1.0 / m && level < 32 {
            level += 1;
        }
        level
    }

    /// Get entry point level
    fn get_entry_level(&self) -> usize {
        if let Some(id) = &self.entry_point {
            if let Some(point) = self.points.get(id) {
                return point.level;
            }
        }
        0
    }

    /// Search a single layer
    fn search_layer(&self, vector: &[f32], ef: usize, layer: usize) -> Vec<(String, f32)> {
        let mut visited = HashSet::new();
        let mut candidates: Vec<(String, f32)> = Vec::new();
        let mut results: Vec<(String, f32)> = Vec::new();

        // Start from entry point
        if let Some(entry_id) = &self.entry_point {
            if let Some(entry_point) = self.points.get(entry_id) {
                let dist = cosine_distance(vector, &entry_point.vector);
                candidates.push((entry_id.clone(), dist));
                visited.insert(entry_id.clone());
            }
        }

        // Greedy search
        while let Some((current_id, _)) = candidates.pop() {
            if let Some(links) = self.layers.get(layer).and_then(|l| l.links.get(&current_id)) {
                for neighbor_id in links {
                    if visited.contains(neighbor_id) {
                        continue;
                    }
                    visited.insert(neighbor_id.clone());

                    if let Some(neighbor) = self.points.get(neighbor_id) {
                        let dist = cosine_distance(vector, &neighbor.vector);

                        if results.is_empty() || dist < results.last().unwrap().1 {
                            candidates.push((neighbor_id.clone(), dist));
                            results.push((neighbor_id.clone(), dist));
                            results.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

                            if results.len() > ef {
                                results.pop();
                            }
                        }
                    }
                }
            }
        }

        results
    }
}

/// Compute cosine distance between two vectors
fn cosine_distance(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;

    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    if norm_a == 0.0 || norm_b == 0.0 {
        return 1.0;
    }

    1.0 - (dot / (norm_a.sqrt() * norm_b.sqrt()))
}
