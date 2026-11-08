# story: a one-minute video in four beats

The project to copy for a real video (see `AGENTS.md` section 1). One invented story, told the way rv tells any story by default:

| scene | beat | place | what happens |
|---|---|---|---|
| reach | problem | kitchen | Mina can't reach the cups on the top shelf |
| inside | inside | lab | the cabinet on a test frame: arms and a motor bring the shelf out and down |
| lower | result | kitchen | she presses the button, the shelf comes down (action shot), a small design-target card |
| after | after | kitchen | she takes a cup by herself |

Every scene is built in a `KIT.place` set, people come from `KIT.fx.human`, the shelf is a `KIT.process.move` part named 선반 so `ACTION_MATCH` ties it to "내려옵니다". The one number is a design target in `sources.json`. Replace the story, keep the shape.
