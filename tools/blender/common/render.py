"""Render setup: Cycles on the GPU when available, AgX view transform, HDRI world, stills."""

from __future__ import annotations

import math

import bpy


def cycles(samples: int = 128, resolution: tuple[int, int] = (1280, 640), denoise: bool = True) -> None:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    device = "CPU"
    for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            device = "GPU"
            break
    sc.cycles.device = device
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = denoise
    sc.cycles.max_bounces = 8
    sc.render.resolution_x, sc.render.resolution_y = resolution
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    color_management(sc)


def color_management(sc: bpy.types.Scene, look: str = "None", exposure: float = 0.0) -> None:
    sc.display_settings.display_device = "sRGB"
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = look
    except TypeError:
        pass
    sc.view_settings.exposure = exposure
    sc.sequencer_colorspace_settings.name = "sRGB"


def hdri_world(path: str, strength: float = 1.0, rotation_deg: float = 0.0) -> None:
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    nt = world.node_tree if world.node_tree else None
    if nt is None:
        world.use_nodes = True
        nt = world.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(rotation_deg))
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(path, check_existing=True)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def camera(location: tuple[float, float, float], target: tuple[float, float, float], lens_mm: float = 50.0) -> bpy.types.Object:
    from mathutils import Vector

    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = location
    direction = Vector(target) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens_mm
    bpy.context.scene.camera = cam
    return cam


def area_light(name: str, location, target, power_w: float, size: float, color=(1.0, 1.0, 1.0)) -> bpy.types.Object:
    from mathutils import Vector

    light = bpy.data.lights.new(name, "AREA")
    light.energy = power_w
    light.size = size
    light.color = color
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    return obj


def still(path: str) -> None:
    sc = bpy.context.scene
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "8"
    sc.render.image_settings.compression = 90
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
