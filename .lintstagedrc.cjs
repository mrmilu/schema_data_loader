module.exports = {
  "**/*": [() => "yarn check-types", () => "yarn lint", "yarn prettier ./packages --check --ignore-unknown"]
};
