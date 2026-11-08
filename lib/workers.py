"""How many browsers rv runs at once, from this machine's cores and free memory.

  python3 lib/workers.py capture|check|shards     one number (rv make/preview --jobs, RV_CHECK_JOBS, RV_CHECK_SHARDS)
  python3 lib/workers.py mem <jobs>               GiB to reserve for a render with that many capture browsers
  python3 lib/workers.py explain                  the numbers and what they came from

Every browser is a Chromium with the scene loaded (about 1.3 GiB measured on a 1080p 3D scene) plus a share of one
CPU core or more, so each count is the smaller of a core budget and a memory budget, and never below 1.
RV_CORES and RV_MEM_GIB replace the detected values (to leave room for other work, or to see what a smaller machine
would get). Explicit --jobs, RV_CHECK_JOBS and RV_CHECK_SHARDS still win over these defaults.
"""
import os
import sys

BROWSER_GIB = 1.5        # per browser: 1.3 GiB measured peak, rounded up
MEMORY_SHARE = 0.75      # of the memory free now; the rest stays for the encoder, the OS and other work
CAPTURE_MAX = 12         # one GB10 GPU: 900 frames took 26.4 s with 12 browsers, 28.2 s with 16, 30.3 s with 20
CHECK_BROWSERS = 12      # check browsers open at once, shards included: with up to 30 (20 checks, 6 shards) a
                         # 3-minute 3D project's sync_check page failed to compile its shaders, a false FAIL
SHARDS_MAX = 4


def cores():
    if os.environ.get("RV_CORES"):
        return max(1, int(os.environ["RV_CORES"]))
    try:
        return max(1, len(os.sched_getaffinity(0)))
    except AttributeError:
        return max(1, os.cpu_count() or 1)


def free_gib():
    if os.environ.get("RV_MEM_GIB"):
        return max(0.0, float(os.environ["RV_MEM_GIB"]))
    try:
        with open("/proc/meminfo") as meminfo:
            fields = dict(line.split(":", 1) for line in meminfo)
        return int(fields["MemAvailable"].split()[0]) / 2 ** 20
    except (OSError, KeyError, ValueError):
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2 ** 30 / 2


def memory_browsers():
    return max(1, int(free_gib() * MEMORY_SHARE / BROWSER_GIB))


def browsers():
    return min(cores(), memory_browsers())


def capture_jobs():
    return max(1, min(browsers(), CAPTURE_MAX))


def check_budget():
    return min(memory_browsers(), CHECK_BROWSERS)


def check_shards():
    return max(1, min(SHARDS_MAX, check_budget() // 3))


def check_jobs():
    # The two long real checks (mesh clearance, layout) each hold one check slot but open check_shards()
    # browsers, so check_jobs + 2 * (shards - 1) browsers can be open at once; that stays within the budget.
    return max(1, min(cores(), check_budget() - 2 * (check_shards() - 1)))


def render_mem_gib(jobs):
    # A cap for the render's memory scope, never below the 24 GiB the render had before for 4 browsers.
    return max(24, int(jobs * BROWSER_GIB + 4.999))


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "explain"
    if what == "capture":
        print(capture_jobs())
    elif what == "check":
        print(check_jobs())
    elif what == "shards":
        print(check_shards())
    elif what == "mem":
        print(render_mem_gib(int(sys.argv[2])))
    elif what == "explain":
        print(f"RV_WORKERS cores={cores()} free_gib={free_gib():.1f} browsers={browsers()} capture={capture_jobs()} "
              f"check={check_jobs()} shards={check_shards()} render_mem_gib={render_mem_gib(capture_jobs())}")
    else:
        sys.exit(f"unknown: {what} (capture|check|shards|mem <jobs>|explain)")


if __name__ == "__main__":
    main()
