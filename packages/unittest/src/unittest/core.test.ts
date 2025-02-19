import { hexFrom, Transaction } from "@ckb-ccc/core";
import assert from "assert";
import { readFileSync } from "fs";
import {
  DEFAULT_SCRIPT_ALWAYS_FAILURE,
  DEFAULT_SCRIPT_ALWAYS_SUCCESS,
  parseAllCycles,
  parseRunResult,
  Resource,
  UnitTestClient,
  Verifier,
} from "./index";

describe("example", () => {
  test("alwaysSuccess", () => {
    const resource = Resource.default();
    const tx = Transaction.default();

    const cellMetaLock = resource.createCell(
      resource.createScriptUnused(),
      hexFrom(readFileSync(DEFAULT_SCRIPT_ALWAYS_SUCCESS)),
    );
    const cellMetaI = resource.createCell(
      resource.createScriptByData(cellMetaLock, "0x"),
    );
    tx.cellDeps.push(resource.createCellDep(cellMetaLock, "code"));
    tx.inputs.push(resource.createCellInput(cellMetaI));

    const verifier = Verifier.from(resource, tx);
    verifier.verifySuccess();
  });

  test("alwaysFailure", () => {
    const resource = Resource.default();
    const tx = Transaction.default();

    const cellMetaLock = resource.createCell(
      resource.createScriptUnused(),
      hexFrom(readFileSync(DEFAULT_SCRIPT_ALWAYS_FAILURE)),
    );
    const cellMetaI = resource.createCell(
      resource.createScriptByData(cellMetaLock, "0x"),
    );
    tx.cellDeps.push(resource.createCellDep(cellMetaLock, "code"));
    tx.inputs.push(resource.createCellInput(cellMetaI));

    const verifier = Verifier.from(resource, tx);
    verifier.verifyFailure();
    verifier.verifyFailure(-1);
  });

  test("parse", () => {
    const resource = Resource.default();
    const tx = Transaction.default();

    const cellMetaLock = resource.createCell(
      resource.createScriptUnused(),
      hexFrom(readFileSync(DEFAULT_SCRIPT_ALWAYS_FAILURE)),
    );
    const cellMetaI = resource.createCell(
      resource.createScriptByData(cellMetaLock, "0x"),
    );
    tx.cellDeps.push(resource.createCellDep(cellMetaLock, "code"));
    tx.inputs.push(resource.createCellInput(cellMetaI));

    const verifier = Verifier.from(resource, tx);
    const result = verifier.verify()[0];
    assert(parseRunResult(result.stdout.toString()) == -1);
    assert(parseAllCycles(result.stdout.toString()) == 543);
  });
  test("signHashInfo", async () => {
    const resource = Resource.default();
    const tx = Transaction.default();
    const client = new UnitTestClient(resource);

    const cellMetaLock = resource.createCell(
      resource.createScriptUnused(),
      hexFrom(readFileSync(DEFAULT_SCRIPT_ALWAYS_SUCCESS)),
    );
    const lockScript = resource.createScriptByData(cellMetaLock, "0x");
    const cellMetaI = resource.createCell(lockScript);
    tx.cellDeps.push(resource.createCellDep(cellMetaLock, "code"));
    tx.inputs.push(resource.createCellInput(cellMetaI));
    // the format of witness should follow WitnessArgs
    tx.witnesses.push(
      hexFrom(
        "0x5500000010000000550000005500000041000000725e20eeee617616f881e65773fdb8d0f2d91619a71cfe18121f3fef67f9cfcb0c019c66ebf67ef2f41123443a786c554a5287ff2a3e92725fa14634c4f1550f01",
      ),
    );
    // extra witness, anything is OK
    tx.witnesses.push(hexFrom("0x00112233445566778899aabbccddeeff"));

    await tx.prepareSighashAllWitness(lockScript, 0, client);
    const sigHashAll = await tx.getSignHashInfo(lockScript, client);
    assert(sigHashAll?.message.length == 66);
    const verifier = Verifier.from(resource, tx);
    verifier.verifySuccess();
  });
});
