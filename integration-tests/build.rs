use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=../truffle/test/solidity/TestToken.sol");

    Command::new("solc")
        .arg("--bin")
        .arg("--abi")
        .arg("../truffle/test/solidity/TestToken.sol")
        .arg("-o")
        .arg("../compiled_contracts")
        .arg("--overwrite")
        .status()
        .expect("failed to compile test token");
}
