import { hexFrom, Transaction } from "@ckb-ccc/core";
import assert from "assert";
import { readFileSync } from "fs";
import {
  DEFAULT_SCRIPT_ALWAYS_FAILURE,
  DEFAULT_SCRIPT_ALWAYS_SUCCESS,
  parseAllCycles,
  parseRunResult,
  Resource,
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
});
