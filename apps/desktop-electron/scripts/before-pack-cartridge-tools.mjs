import { Arch } from "builder-util";
import { packageHelperArchitectures, prepareCartridgeTools } from "./prepare-cartridge-tools.mjs";

export default async function beforePack(context) {
  for (const arch of packageHelperArchitectures(context.electronPlatformName, Arch[context.arch], context.appOutDir)) {
    prepareCartridgeTools({ platform: context.electronPlatformName, arch });
  }
}
