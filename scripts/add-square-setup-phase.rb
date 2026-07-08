#!/usr/bin/env ruby
# Runs during EAS `eas-build-post-install` — i.e. AFTER `expo prebuild` and
# `pod install`, so the ios/ project exists and the CocoaPods
# `[CP] Embed Pods Frameworks` phase is already on the app target.
#
# Square Mobile Payments SDK ships CorePaymentCard/LCRCore/SquareReader nested
# inside SquareMobilePaymentsSDK.framework/Frameworks/. iOS can't resolve them
# via @rpath at launch → "Library not loaded" crash. Square's fix is a Run
# Script build phase that runs the framework's `setup` script (which moves the
# nested frameworks up to the app's Frameworks/), and it MUST run AFTER
# [CP] Embed Pods Frameworks. Appending it here guarantees it runs last.
#
# Ref: square/in-app-payments-react-native-plugin#236

require 'xcodeproj'

proj_path = Dir.glob('ios/*.xcodeproj').first
if proj_path.nil?
  warn '[square-setup] No ios/*.xcodeproj found — skipping (prebuild not run yet?)'
  exit 0
end

project = Xcodeproj::Project.open(proj_path)

SETUP_SCRIPT = <<~SH
  SETUP_SCRIPT="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}/SquareMobilePaymentsSDK.framework/setup"
  if [ -f "$SETUP_SCRIPT" ]; then
    "$SETUP_SCRIPT"
  fi
SH

added = false
project.targets.each do |target|
  next unless target.product_type == 'com.apple.product-type.application'

  # Remove any prior copy so re-runs stay idempotent and it always lands last.
  target.build_phases.to_a.each do |ph|
    if ph.respond_to?(:name) && ph.name == 'Square SDK Setup'
      target.build_phases.delete(ph)
    end
  end

  phase = target.new_shell_script_build_phase('Square SDK Setup')
  phase.shell_path = '/bin/sh'
  phase.shell_script = SETUP_SCRIPT
  # new_shell_script_build_phase appends to the end → after [CP] Embed Pods Frameworks.
  added = true
  puts "[square-setup] Added 'Square SDK Setup' build phase (last) to target #{target.name}"
end

project.save
warn '[square-setup] WARNING: no application target found' unless added
