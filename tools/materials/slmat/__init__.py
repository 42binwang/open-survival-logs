"""Material graph library: periodic image ops, calibration, seam repair, masks, mips and KTX2 encoding.

Everything here works on float32 arrays shaped (H, W, C) in [0, 1] (normals in [-1, 1]) and treats images as
periodic (they are tiling textures), so filters and resampling wrap around the edges.
"""
