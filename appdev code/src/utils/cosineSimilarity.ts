/**
 * Computes the cosine similarity between two Float32Arrays.
 * formula: (A . B) / (||A|| * ||B||)
 */
export function cosineSimilarity(arr1: Float32Array, arr2: Float32Array): number {
  if (arr1.length !== arr2.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < arr1.length; i++) {
    const val1 = arr1[i];
    const val2 = arr2[i];
    dotProduct += val1 * val2;
    normA += val1 * val1;
    normB += val2 * val2;
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
