<?php
/**
 * Plugin Name: Local to Pages
 * Description: Provides site metadata for llms.txt generation via the Local to Pages add-on.
 * Version:     1.0.0
 * Author:      Matt Lawrence
 * License:     GPL-2.0-or-later
 *
 * @package local-to-pages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

add_action(
	'admin_menu',
	function () {
		add_options_page(
			'Local to Pages',
			'Local to Pages',
			'manage_options',
			'local-to-pages',
			'ltp_settings_page'
		);
	}
);

add_action(
	'admin_init',
	function () {
		register_setting(
			'ltp_settings',
			'ltp_options',
			array(
				'sanitize_callback' => 'ltp_sanitize',
			)
		);

		// --- Identity section ---
		add_settings_section( 'ltp_identity', 'Site Identity', null, 'local-to-pages' );

		$identity_fields = array(
			'role'           => 'Author Role / Tagline',
			'employer_name'  => 'Employer Name',
			'employer_url'   => 'Employer URL',
			'knows_about'    => 'Areas of Expertise (comma-separated)',
			'optional_slugs' => 'Optional Page Slugs (comma-separated)',
		);

		foreach ( $identity_fields as $key => $label ) {
			add_settings_field(
				"ltp_$key",
				$label,
				function () use ( $key ) {
					$options = get_option( 'ltp_options', array() );
					$value   = isset( $options[ $key ] ) ? $options[ $key ] : '';
					echo '<input type="text" name="ltp_options[' . esc_attr( $key ) . ']" value="' . esc_attr( $value ) . '" class="regular-text">';
				},
				'local-to-pages',
				'ltp_identity'
			);
		}

		add_settings_field(
			'ltp_identity_disambiguation',
			'Identity Disambiguation',
			function () {
				$options = get_option( 'ltp_options', array() );
				$value   = isset( $options['identity_disambiguation'] ) ? $options['identity_disambiguation'] : '';
				echo '<textarea name="ltp_options[identity_disambiguation]" rows="4" class="large-text">' . esc_textarea( $value ) . '</textarea>';
				echo '<p class="description">A short paragraph to help AI agents distinguish you from others. Included in llms-full.txt.</p>';
			},
			'local-to-pages',
			'ltp_identity'
		);

		add_settings_field(
			'ltp_sameAs_links',
			'Identity Links (sameAs)',
			'ltp_render_same_as_links',
			'local-to-pages',
			'ltp_identity'
		);

		// --- Career history section ---
		add_settings_section( 'ltp_career', 'Career History', null, 'local-to-pages' );

		add_settings_field(
			'ltp_career_history',
			'Roles',
			'ltp_render_career_history',
			'local-to-pages',
			'ltp_career'
		);

		// --- Opinions section ---
		add_settings_section( 'ltp_opinions_section', 'Original Technical Positions', null, 'local-to-pages' );

		add_settings_field(
			'ltp_opinions',
			'Positions',
			'ltp_render_opinions',
			'local-to-pages',
			'ltp_opinions_section'
		);
	}
);

// ---------------------------------------------------------------------------
// Dynamic field renderers
// ---------------------------------------------------------------------------

/**
 * Output the shared JS helper for dynamic add/remove tables.
 * Called once per page load; subsequent calls are no-ops.
 */
function ltp_maybe_print_dynamic_table_js() {
	static $printed = false;
	if ( $printed ) {
		return;
	}
	$printed = true;
	?>
	<script>
	function ltpInitDynamicTable( tbodyId, addBtnId, buildRow ) {
		var tbody  = document.getElementById( tbodyId );
		var addBtn = document.getElementById( addBtnId );

		function reindex() {
			tbody.querySelectorAll( 'tr' ).forEach( function ( row, i ) {
				row.querySelectorAll( 'input, textarea, select' ).forEach( function ( el ) {
					el.name = el.name.replace( /\[\d+\]/, '[' + i + ']' );
				} );
			} );
		}

		function addRemoveListener( row ) {
			row.querySelector( '.ltp-remove-row' ).addEventListener( 'click', function () {
				row.remove();
				reindex();
			} );
		}

		addBtn.addEventListener( 'click', function () {
			var i   = tbody.querySelectorAll( 'tr' ).length;
			var row = document.createElement( 'tr' );
			row.innerHTML = buildRow( i );
			tbody.appendChild( row );
			addRemoveListener( row );
		} );

		tbody.querySelectorAll( 'tr' ).forEach( function ( row ) {
			addRemoveListener( row );
		} );
	}
	</script>
	<?php
}

/**
 * Render the dynamic sameAs links field.
 */
function ltp_render_same_as_links() {
	ltp_maybe_print_dynamic_table_js();
	$options = get_option( 'ltp_options', array() );
	$links   = isset( $options['sameAs_links'] ) && is_array( $options['sameAs_links'] ) ? $options['sameAs_links'] : array();
	?>
	<table class="widefat" style="max-width:600px;">
		<thead><tr><th>Label</th><th>URL</th><th></th></tr></thead>
		<tbody id="ltp-same-as-rows">
			<?php foreach ( $links as $i => $link ) : ?>
				<tr>
					<td><input type="text" name="ltp_options[sameAs_links][<?php echo (int) $i; ?>][label]" value="<?php echo esc_attr( $link['label'] ); ?>" class="regular-text"></td>
					<td><input type="url" name="ltp_options[sameAs_links][<?php echo (int) $i; ?>][url]" value="<?php echo esc_attr( $link['url'] ); ?>" class="regular-text"></td>
					<td><button type="button" class="button ltp-remove-row">Remove</button></td>
				</tr>
			<?php endforeach; ?>
		</tbody>
	</table>
	<p><button type="button" class="button" id="ltp-add-same-as">Add Link</button></p>
	<p class="description">Used in the Person schema sameAs and in llms.txt to verify your identity.</p>
	<script>
	ltpInitDynamicTable( 'ltp-same-as-rows', 'ltp-add-same-as', function ( i ) {
		return '<td><input type="text" name="ltp_options[sameAs_links][' + i + '][label]" value="" class="regular-text"></td>' +
			'<td><input type="url" name="ltp_options[sameAs_links][' + i + '][url]" value="" class="regular-text"></td>' +
			'<td><button type="button" class="button ltp-remove-row">Remove</button></td>';
	} );
	</script>
	<?php
}

/**
 * Render the dynamic career history field.
 */
function ltp_render_career_history() {
	ltp_maybe_print_dynamic_table_js();
	$options = get_option( 'ltp_options', array() );
	$entries = isset( $options['career_history'] ) && is_array( $options['career_history'] ) ? $options['career_history'] : array();
	?>
	<table class="widefat" style="max-width:800px;">
		<thead><tr><th>Company</th><th>Role</th><th>Start Year</th><th>End Year</th><th></th></tr></thead>
		<tbody id="ltp-career-rows">
			<?php foreach ( $entries as $i => $entry ) : ?>
				<tr>
					<td><input type="text" name="ltp_options[career_history][<?php echo (int) $i; ?>][company]" value="<?php echo esc_attr( $entry['company'] ); ?>" class="regular-text"></td>
					<td><input type="text" name="ltp_options[career_history][<?php echo (int) $i; ?>][role]" value="<?php echo esc_attr( $entry['role'] ); ?>" class="regular-text"></td>
					<td><input type="number" name="ltp_options[career_history][<?php echo (int) $i; ?>][start_year]" value="<?php echo esc_attr( $entry['start_year'] ); ?>" style="width:80px;"></td>
					<td><input type="text" name="ltp_options[career_history][<?php echo (int) $i; ?>][end_year]" value="<?php echo esc_attr( $entry['end_year'] ); ?>" placeholder="Present" style="width:80px;"></td>
					<td><button type="button" class="button ltp-remove-row">Remove</button></td>
				</tr>
			<?php endforeach; ?>
		</tbody>
	</table>
	<p><button type="button" class="button" id="ltp-add-career">Add Role</button></p>
	<p class="description">Chronological career history. Leave End Year blank for current role. Used in Person schema and llms-full.txt.</p>
	<script>
	ltpInitDynamicTable( 'ltp-career-rows', 'ltp-add-career', function ( i ) {
		return '<td><input type="text" name="ltp_options[career_history][' + i + '][company]" value="" class="regular-text"></td>' +
			'<td><input type="text" name="ltp_options[career_history][' + i + '][role]" value="" class="regular-text"></td>' +
			'<td><input type="number" name="ltp_options[career_history][' + i + '][start_year]" value="" style="width:80px;"></td>' +
			'<td><input type="text" name="ltp_options[career_history][' + i + '][end_year]" value="" placeholder="Present" style="width:80px;"></td>' +
			'<td><button type="button" class="button ltp-remove-row">Remove</button></td>';
	} );
	</script>
	<?php
}

/**
 * Render the dynamic opinions field.
 */
function ltp_render_opinions() {
	ltp_maybe_print_dynamic_table_js();
	$options  = get_option( 'ltp_options', array() );
	$opinions = isset( $options['opinions'] ) && is_array( $options['opinions'] ) ? $options['opinions'] : array();
	?>
	<table class="widefat" style="max-width:800px;">
		<thead><tr><th style="width:30%;">Topic</th><th>Position</th><th></th></tr></thead>
		<tbody id="ltp-opinion-rows">
			<?php foreach ( $opinions as $i => $opinion ) : ?>
				<tr>
					<td><input type="text" name="ltp_options[opinions][<?php echo (int) $i; ?>][topic]" value="<?php echo esc_attr( $opinion['topic'] ); ?>" class="regular-text"></td>
					<td><input type="text" name="ltp_options[opinions][<?php echo (int) $i; ?>][position]" value="<?php echo esc_attr( $opinion['position'] ); ?>" class="large-text"></td>
					<td><button type="button" class="button ltp-remove-row">Remove</button></td>
				</tr>
			<?php endforeach; ?>
		</tbody>
	</table>
	<p><button type="button" class="button" id="ltp-add-opinion">Add Position</button></p>
	<p class="description">Original technical opinions on specific topics. Included in llms.txt and llms-full.txt to improve AI citation eligibility.</p>
	<script>
	ltpInitDynamicTable( 'ltp-opinion-rows', 'ltp-add-opinion', function ( i ) {
		return '<td><input type="text" name="ltp_options[opinions][' + i + '][topic]" value="" class="regular-text"></td>' +
			'<td><input type="text" name="ltp_options[opinions][' + i + '][position]" value="" class="large-text"></td>' +
			'<td><button type="button" class="button ltp-remove-row">Remove</button></td>';
	} );
	</script>
	<?php
}

// ---------------------------------------------------------------------------
// Sanitize
// ---------------------------------------------------------------------------

/**
 * Sanitize Local to Pages options input.
 *
 * @param array $input Raw input from the settings form.
 * @return array Sanitized options.
 */
function ltp_sanitize( $input ) {
	$clean = array();

	foreach ( array( 'role', 'employer_name', 'employer_url', 'knows_about', 'optional_slugs' ) as $key ) {
		$clean[ $key ] = sanitize_text_field( isset( $input[ $key ] ) ? $input[ $key ] : '' );
	}

	$clean['identity_disambiguation'] = sanitize_textarea_field(
		isset( $input['identity_disambiguation'] ) ? $input['identity_disambiguation'] : ''
	);

	// sameAs links.
	$clean['sameAs_links'] = array();
	if ( isset( $input['sameAs_links'] ) && is_array( $input['sameAs_links'] ) ) {
		foreach ( $input['sameAs_links'] as $link ) {
			$label = sanitize_text_field( isset( $link['label'] ) ? $link['label'] : '' );
			$url   = esc_url_raw( isset( $link['url'] ) ? $link['url'] : '' );
			if ( $label && $url ) {
				$clean['sameAs_links'][] = array(
					'label' => $label,
					'url'   => $url,
				);
			}
		}
	}

	// Career history.
	$clean['career_history'] = array();
	if ( isset( $input['career_history'] ) && is_array( $input['career_history'] ) ) {
		foreach ( $input['career_history'] as $entry ) {
			$company    = sanitize_text_field( isset( $entry['company'] ) ? $entry['company'] : '' );
			$role       = sanitize_text_field( isset( $entry['role'] ) ? $entry['role'] : '' );
			$start_year = absint( isset( $entry['start_year'] ) ? $entry['start_year'] : 0 );
			$end_year   = sanitize_text_field( isset( $entry['end_year'] ) ? $entry['end_year'] : '' );
			if ( $company && $role && $start_year ) {
				$clean['career_history'][] = array(
					'company'    => $company,
					'role'       => $role,
					'start_year' => $start_year,
					'end_year'   => $end_year,
				);
			}
		}
	}

	// Opinions.
	$clean['opinions'] = array();
	if ( isset( $input['opinions'] ) && is_array( $input['opinions'] ) ) {
		foreach ( $input['opinions'] as $opinion ) {
			$topic    = sanitize_text_field( isset( $opinion['topic'] ) ? $opinion['topic'] : '' );
			$position = sanitize_text_field( isset( $opinion['position'] ) ? $opinion['position'] : '' );
			if ( $topic && $position ) {
				$clean['opinions'][] = array(
					'topic'    => $topic,
					'position' => $position,
				);
			}
		}
	}

	return $clean;
}

// ---------------------------------------------------------------------------
// Settings page renderer
// ---------------------------------------------------------------------------

/**
 * Render the Local to Pages admin settings page.
 */
function ltp_settings_page() {
	?>
	<div class="wrap">
		<h1>Local to Pages</h1>
		<p>These fields are used by the <strong>Local to Pages</strong> add-on when generating your <code>llms.txt</code> file.</p>
		<form method="post" action="options.php">
			<?php
			settings_fields( 'ltp_settings' );
			do_settings_sections( 'local-to-pages' );
			submit_button();
			?>
		</form>
	</div>
	<?php
}

// ---------------------------------------------------------------------------
// REST API endpoint — public read, no auth required
// ---------------------------------------------------------------------------

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'local-to-pages/v1',
			'/settings',
			array(
				'methods'             => 'GET',
				'callback'            => function () {
					$options        = get_option( 'ltp_options', array() );
					$optional_raw   = isset( $options['optional_slugs'] ) ? $options['optional_slugs'] : '';
					$optional_slugs = array_values(
						array_filter(
							array_map( 'trim', explode( ',', $optional_raw ) )
						)
					);
					$knows_raw   = isset( $options['knows_about'] ) ? $options['knows_about'] : '';
					$knows_about = array_values(
						array_filter(
							array_map( 'trim', explode( ',', $knows_raw ) )
						)
					);
					$same_as_links   = isset( $options['sameAs_links'] ) && is_array( $options['sameAs_links'] )
						? array_values( $options['sameAs_links'] )
						: array();
					$career_history  = isset( $options['career_history'] ) && is_array( $options['career_history'] )
						? array_values( $options['career_history'] )
						: array();
					$opinions        = isset( $options['opinions'] ) && is_array( $options['opinions'] )
						? array_values( $options['opinions'] )
						: array();

					return rest_ensure_response(
						array(
							'role'                    => isset( $options['role'] ) ? $options['role'] : '',
							'employer_name'           => isset( $options['employer_name'] ) ? $options['employer_name'] : '',
							'employer_url'            => isset( $options['employer_url'] ) ? $options['employer_url'] : '',
							'knows_about'             => $knows_about,
							'optional_slugs'          => $optional_slugs,
							'sameAs_links'            => $same_as_links,
							'identity_disambiguation' => isset( $options['identity_disambiguation'] ) ? $options['identity_disambiguation'] : '',
							'career_history'          => $career_history,
							'opinions'                => $opinions,
						)
					);
				},
				'permission_callback' => '__return_true',
			)
		);
	}
);
