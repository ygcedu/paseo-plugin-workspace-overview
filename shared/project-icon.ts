import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const projectIconRpc = defineRpc({
  name: "project_icon_data_uri",
  input: z.object({
    projectId: z.string().min(1),
    projectDirectory: z.string().min(1),
  }),
  output: z.object({
    dataUri: z.string().nullable(),
  }),
});
